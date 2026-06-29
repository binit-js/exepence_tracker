import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from api.endpoints import router as api_router
from training.model_trainer import train_category_model, train_risk_model

app = FastAPI(title="Budget Saathi AI Services", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(api_router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "Budget Saathi AI Microservice",
        "endpoints": ["/predict-category", "/predict-budget-risk", "/forecast", "/ocr", "/chat"]
    }

# Startup event to ensure models are trained and saved
@app.on_event("startup")
def startup_event():
    category_pkl = 'models/category_model.pkl'
    risk_pkl = 'models/risk_model.pkl'
    
    # Auto-train if pickling directory is empty
    if not os.path.exists(category_pkl):
        print(f"[{category_pkl}] not found. Starting automatic training...")
        try:
            train_category_model()
        except Exception as e:
            print(f"Error training category model: {e}")
            
    if not os.path.exists(risk_pkl):
        print(f"[{risk_pkl}] not found. Starting automatic training...")
        try:
            train_risk_model()
        except Exception as e:
            print(f"Error training risk model: {e}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
