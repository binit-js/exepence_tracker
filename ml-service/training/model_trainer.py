import os
import pickle
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

def train_category_model():
    print("Training Category Prediction Model...")
    
    # Dataset mapping description terms to Category IDs (1-9)
    # 1: Food & Dining, 2: Transportation, 3: Shopping, 4: Entertainment, 
    # 5: Bills & Utilities, 6: Healthcare, 7: Education, 8: Travel, 9: Other
    data = [
        # Food & Dining (1)
        ("uber eats", 1), ("zomato", 1), ("swiggy", 1), ("starbucks", 1), 
        ("restaurant", 1), ("cafe", 1), ("pizza hut", 1), ("dominos", 1), 
        ("mcdonalds", 1), ("burger king", 1), ("kfc", 1), ("diner", 1), 
        ("lunch with colleagues", 1), ("dinner date", 1), ("breakfast", 1), 
        ("grocery food", 1), ("coffee shop", 1), ("subway", 1), ("tea stall", 1),
        
        # Transportation (2)
        ("uber", 2), ("ola", 2), ("rapido", 2), ("cab ride", 2), 
        ("taxi fare", 2), ("metro ticket", 2), ("bus pass", 2), ("train ticket", 2), 
        ("fuel", 2), ("petrol refill", 2), ("diesel", 2), ("parking fee", 2),
        ("toll plaza", 2), ("auto fare", 2), ("gas station", 2),
        
        # Shopping (3)
        ("amazon purchase", 3), ("flipkart delivery", 3), ("myntra fashion", 3), 
        ("clothes shopping", 3), ("shoes", 3), ("mall checkout", 3), 
        ("grocery supermarket", 3), ("walmart", 3), ("target store", 3), 
        ("supermarket", 3), ("t-shirt buy", 3), ("jeans", 3), ("electronics", 3),
        ("mobile phone case", 3), ("gift items", 3), ("stationary", 3),
        
        # Entertainment (4)
        ("netflix subscription", 4), ("prime video", 4), ("spotify premium", 4), 
        ("movie ticket", 4), ("cinema tickets", 4), ("concert pass", 4), 
        ("gaming steam", 4), ("playstation network", 4), ("bowling alley", 4),
        ("clubbing entry", 4), ("amusement park", 4), ("youtube premium", 4),
        
        # Bills & Utilities (5)
        ("electricity bill", 5), ("water bill payment", 5), ("wifi internet", 5), 
        ("broadband bill", 5), ("mobile recharge", 5), ("house rent", 5), 
        ("gas cylinder", 5), ("phone bill", 5), ("dth recharge", 5),
        ("insurance premium", 5), ("maintenance charge", 5),
        
        # Healthcare (6)
        ("apollo pharmacy", 6), ("doctor consultation", 6), ("medicine buy", 6), 
        ("dental checkup", 6), ("hospital bill", 6), ("blood test lab", 6), 
        ("health checkup", 6), ("eye clinic glasses", 6), ("cough syrup", 6),
        
        # Education (7)
        ("college tuition fee", 7), ("school fees", 7), ("textbooks", 7), 
        ("udemy course", 7), ("coursera certificate", 7), ("exam registration", 7), 
        ("coding bootcamp", 7), ("stationery notebook", 7), ("tutorial fee", 7),
        
        # Travel (8)
        ("flight ticket", 8), ("hotel booking room", 8), ("airbnb stay", 8), 
        ("makemytrip booking", 8), ("resort stay", 8), ("holiday package", 8), 
        ("visa fees", 8), ("luggage bag", 8), ("sightseeing tour", 8),
        
        # Other (9)
        ("miscellaneous", 9), ("cash withdrawal", 9), ("friend transfer", 9), 
        ("donation", 9), ("lost money", 9), ("gift to sibling", 9), ("general expense", 9)
    ]
    
    # Expand dataset with minor variations to improve training density
    expanded_data = []
    for text, label in data:
        expanded_data.append((text, label))
        expanded_data.append((text.lower(), label))
        expanded_data.append((text.upper(), label))
        expanded_data.append((text.title(), label))
        
    df = pd.DataFrame(expanded_data, columns=["text", "label"])
    
    # Create TF-IDF + Naive Bayes pipeline
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(ngram_range=(1, 2), lowercase=True)),
        ('clf', MultinomialNB(alpha=0.1))
    ])
    
    pipeline.fit(df['text'], df['label'])
    
    # Save model
    os.makedirs('models', exist_ok=True)
    with open('models/category_model.pkl', 'wb') as f:
        pickle.dump(pipeline, f)
    print("Category model saved to models/category_model.pkl")

def train_risk_model():
    print("Training Budget Risk Prediction Model...")
    
    # Generate synthetic training dataset for budget overspend risk
    # Features:
    # 1. spent_ratio: (current_spent / budget_limit)
    # 2. elapsed_ratio: (current_day / 30)
    # 3. velocity_ratio: (spent_ratio / elapsed_ratio)
    # Target: 0 (Low Risk), 1 (Medium Risk), 2 (High Risk)
    
    np.random.seed(42)
    n_samples = 1000
    
    spent_ratios = np.random.uniform(0.1, 1.5, n_samples)
    elapsed_ratios = np.random.uniform(0.1, 1.0, n_samples)
    velocity_ratios = spent_ratios / elapsed_ratios
    
    labels = []
    for s_r, e_r, v_r in zip(spent_ratios, elapsed_ratios, velocity_ratios):
        # Rule system to create labels
        if s_r >= 1.0: # already exceeded
            labels.append(2) # High Risk
        elif v_r > 1.25 and e_r < 0.8: # spending too fast early on
            labels.append(2) # High Risk
        elif v_r > 1.0 and s_r > 0.6:
            labels.append(1) # Medium Risk
        elif v_r < 0.85:
            labels.append(0) # Low Risk
        else:
            labels.append(1) # Medium Risk
            
    df = pd.DataFrame({
        'spent_ratio': spent_ratios,
        'elapsed_ratio': elapsed_ratios,
        'velocity_ratio': velocity_ratios,
        'label': labels
    })
    
    X = df[['spent_ratio', 'elapsed_ratio', 'velocity_ratio']]
    y = df['label']
    
    model = LogisticRegression(multi_class='multinomial', max_iter=1000)
    model.fit(X, y)
    
    # Save model
    os.makedirs('models', exist_ok=True)
    with open('models/risk_model.pkl', 'wb') as f:
        pickle.dump(model, f)
    print("Risk model saved to models/risk_model.pkl")

if __name__ == "__main__":
    train_category_model()
    train_risk_model()
