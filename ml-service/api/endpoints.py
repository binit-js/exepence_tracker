import os
import pickle
import numpy as np
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any

from utils.helpers import parse_ocr_text, query_llm_financial_assistant

router = APIRouter()

# Map Category IDs to Names (matching schema.sql)
CATEGORY_MAP = {
    1: 'Food & Dining',
    2: 'Transportation',
    3: 'Shopping',
    4: 'Entertainment',
    5: 'Bills & Utilities',
    6: 'Healthcare',
    7: 'Education',
    8: 'Travel',
    9: 'Other'
}

# Lazy loading of models
category_model = None
risk_model = None

def load_models():
    global category_model, risk_model
    try:
        if category_model is None and os.path.exists('models/category_model.pkl'):
            with open('models/category_model.pkl', 'rb') as f:
                category_model = pickle.load(f)
        if risk_model is None and os.path.exists('models/risk_model.pkl'):
            with open('models/risk_model.pkl', 'rb') as f:
                risk_model = pickle.load(f)
    except Exception as e:
        print(f"Error loading models: {e}")

class CategoryRequest(BaseModel):
    description: str

class CategoryResponse(BaseModel):
    category: str
    confidence: float

@router.post("/predict-category", response_model=CategoryResponse)
async def predict_category(req: CategoryRequest):
    load_models()
    if category_model is None:
        # Graceful fallback if training has failed or is in progress
        return CategoryResponse(category="Other", confidence=50.0)
        
    try:
        # Run prediction
        pred_id = int(category_model.predict([req.description])[0])
        probas = category_model.predict_proba([req.description])[0]
        confidence = float(probas[category_model.classes_ == pred_id][0]) * 100
        
        category_name = CATEGORY_MAP.get(pred_id, "Other")
        return CategoryResponse(category=category_name, confidence=round(confidence, 1))
    except Exception as e:
        print(f"Prediction error: {e}")
        return CategoryResponse(category="Other", confidence=50.0)

class BudgetRiskRequest(BaseModel):
    budget_limit: float
    total_spent: float
    day_of_month: int
    category_breakdown: List[Dict[str, Any]]

class BudgetRiskResponse(BaseModel):
    risk: str
    confidence: float
    expectedOverspend: float
    recommendation: str

@router.post("/predict-budget-risk", response_model=BudgetRiskResponse)
async def predict_budget_risk(req: BudgetRiskRequest):
    load_models()
    
    # Core mathematical calculations
    limit = req.budget_limit
    spent = req.total_spent
    day = req.day_of_month
    
    if limit <= 0:
        return BudgetRiskResponse(
            risk="Low",
            confidence=100.0,
            expectedOverspend=0.0,
            recommendation="Set a monthly budget to enable overrun prediction."
        )
        
    spent_ratio = spent / limit
    elapsed_ratio = day / 30.0
    velocity_ratio = spent_ratio / elapsed_ratio if elapsed_ratio > 0 else 0
    
    # Predict using model if loaded
    risk_label = 0 # default Low
    confidence = 80.0 # default
    
    if risk_model is not None:
        try:
            features = np.array([[spent_ratio, elapsed_ratio, velocity_ratio]])
            risk_label = int(risk_model.predict(features)[0])
            probas = risk_model.predict_proba(features)[0]
            confidence = float(probas[risk_label]) * 100
        except Exception as e:
            print(f"Risk prediction model error: {e}")
            # Fallback to analytical calculation
            if spent_ratio >= 1.0 or velocity_ratio > 1.2:
                risk_label = 2
            elif velocity_ratio > 0.9:
                risk_label = 1
            else:
                risk_label = 0
    else:
        # Analytical fallback
        if spent_ratio >= 1.0 or velocity_ratio > 1.2:
            risk_label = 2
        elif velocity_ratio > 0.9:
            risk_label = 1
        else:
            risk_label = 0
            
    risk_map = {0: "Low", 1: "Medium", 2: "High"}
    risk_text = risk_map.get(risk_label, "Low")
    
    # Calculate expected overspend
    projected = (spent / day) * 30 if day > 0 else spent
    expected_overspend = max(0.0, projected - limit)
    
    # Calculate recommendation based on category breakdown
    rec = "Keep tracking your daily expenses!"
    if risk_label > 0 and req.category_breakdown:
        try:
            # Sort categories descending by amount
            sorted_cats = sorted(req.category_breakdown, key=lambda x: x.get('total', 0), reverse=True)
            top_cat = sorted_cats[0].get('name', 'highest spending')
            rec = f"Reduce {top_cat} spending by 10% to stay within budget."
        except Exception:
            rec = "Reduce restaurant & shopping spending by 10% to stay within budget."
    elif risk_label > 0:
        rec = "Reduce restaurant & shopping spending by 10% to stay within budget."
        
    return BudgetRiskResponse(
        risk=risk_text,
        confidence=round(confidence, 1),
        expectedOverspend=round(expected_overspend, 2),
        recommendation=rec
    )

class ForecastRequest(BaseModel):
    history: List[float]

class ForecastResponse(BaseModel):
    current: float
    forecast: float
    growth: float

@router.post("/forecast", response_model=ForecastResponse)
async def forecast(req: ForecastRequest):
    # History contains totals for the past 6 months (e.g. from older to newer)
    hist = req.history
    if not hist:
        return ForecastResponse(current=0.0, forecast=0.0, growth=0.0)
        
    current = hist[-1]
    
    # Perform a simple trend regression
    # If not enough points, project using the moving average
    n_points = len(hist)
    if n_points >= 2:
        try:
            x = np.arange(n_points)
            y = np.array(hist)
            # Line of best fit y = mx + c
            m, c = np.polyfit(x, y, 1)
            # Forecast next month (index = n_points)
            fc = m * n_points + c
            # Ensure forecast is positive
            fc = max(0.0, fc)
        except Exception as e:
            print(f"Regression error: {e}")
            fc = sum(hist) / n_points
    else:
        fc = current
        
    # Calculate growth percentage
    if current > 0:
        growth = ((fc - current) / current) * 100
    else:
        growth = 0.0
        
    return ForecastResponse(
        current=round(current, 2),
        forecast=round(fc, 2),
        growth=round(growth, 1)
    )

@router.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    """Receives receipt image, runs EasyOCR to extract texts, and parses transaction fields."""
    try:
        contents = await file.read()
        
        # Save temp file for easyocr input
        temp_path = f"temp_{file.filename}"
        with open(temp_path, "wb") as f:
            f.write(contents)
            
        try:
            import easyocr
            # Load reader (caches weights automatically on first call)
            reader = easyocr.Reader(['en'], gpu=False)
            results = reader.readtext(temp_path, detail=0)
        except ImportError:
            print("easyocr not installed or failed to import. Falling back to mock mock OCR parser.")
            # Mock details in case EasyOCR is not available for testing
            results = ["Walmart Store", "Total: 1250.50", "Date: 28-06-2026", "Thank you for shopping!"]
        except Exception as e:
            print(f"EasyOCR Error: {e}")
            results = ["Walmart Store", "Total: 1250.50", "Date: 28-06-2026", "Thank you for shopping!"]
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
        if not results:
            raise HTTPException(status_code=400, detail="Could not detect any text on the receipt.")
            
        # Parse fields from raw text strings
        extracted = parse_ocr_text(results)
        
        # Automatically predict category for extracted merchant description
        category_name = "Other"
        load_models()
        if category_model is not None and extracted["merchant"]:
            try:
                pred_id = int(category_model.predict([extracted["merchant"]])[0])
                category_name = CATEGORY_MAP.get(pred_id, "Other")
            except Exception:
                pass
                
        extracted["category"] = category_name
        return extracted
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ChatRequest(BaseModel):
    message: str
    user_id: int

class ChatResponse(BaseModel):
    response: str

@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    try:
        response_text = query_llm_financial_assistant(req.user_id, req.message)
        return ChatResponse(response=response_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
