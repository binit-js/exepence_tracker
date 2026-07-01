import os
import re
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import google.generativeai as genai

# Load env from parent directory
parent_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env_path = os.path.join(parent_dir, '.env')
load_dotenv(dotenv_path=env_path)

def get_db_connection():
    """Establishes connection to the PostgreSQL database using parent .env parameters."""
    connection_string = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not connection_string:
        raise ValueError("SUPABASE_DB_URL is missing in environment variables")
    return psycopg2.connect(connection_string, cursor_factory=RealDictCursor)

def run_query(query, params=None):
    """Executes a query and returns results."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params or ())
            result = cursor.fetchall()
        conn.commit()
        return result
    except Exception as e:
        print(f"Database Query Error: {e}")
        return []
    finally:
        conn.close()

# Initialize Gemini if available
gemini_api_key = os.getenv("GEMINI_API_KEY")
if gemini_api_key:
    genai.configure(api_key=gemini_api_key)
    print("Gemini AI API configured successfully.")
else:
    print("No GEMINI_API_KEY found in env. Falling back to rule-based chatbot.")

def query_llm_financial_assistant(user_id, question):
    """Answers user financial queries using Gemini LLM if key exists, otherwise fallback."""
    
    # 1. Fetch user dashboard statistics
    now = datetime.now()
    current_month = now.month
    current_year = now.year
    
    # Total spent this month
    spent_res = run_query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = %s AND EXTRACT(MONTH FROM date) = %s AND EXTRACT(YEAR FROM date) = %s",
        (user_id, current_month, current_year)
    )
    total_spent = float(spent_res[0]['total']) if spent_res else 0.0
    
    # Budget limit
    budget_res = run_query(
        "SELECT amount FROM budgets WHERE user_id = %s AND month = %s AND year = %s",
        (user_id, current_month, current_year)
    )
    budget_limit = float(budget_res[0]['amount']) if budget_res and budget_res[0]['amount'] else 0.0
    
    # Category breakdown
    breakdown_res = run_query(
        """SELECT c.name, SUM(e.amount) as total 
           FROM expenses e 
           JOIN categories c ON e.category_id = c.id 
           WHERE e.user_id = %s AND EXTRACT(MONTH FROM e.date) = %s AND EXTRACT(YEAR FROM e.date) = %s 
           GROUP BY c.name""",
        (user_id, current_month, current_year)
    )
    breakdown_str = ", ".join([f"{item['name']}: ₹{item['total']}" for item in breakdown_res]) if breakdown_res else "No expenses yet"
    
    # Recent 10 transactions
    recent_res = run_query(
        """SELECT e.amount, e.description, c.name as category, e.date 
           FROM expenses e 
           JOIN categories c ON e.category_id = c.id 
           WHERE e.user_id = %s 
           ORDER BY e.date DESC LIMIT 10""",
        (user_id,)
    )
    recent_str = "\n".join([f"- ₹{tx['amount']} on {tx['description']} ({tx['category']}) on {tx['date'].strftime('%Y-%m-%d')}" for tx in recent_res]) if recent_res else "No recent transactions"
    
    # 2. If Gemini API Key exists, use it
    if gemini_api_key:
        try:
            model = genai.GenerativeModel('gemini-1.5-flash')
            
            prompt = f"""
You are "Budget Saathi AI", a helpful financial assistant inside the Budget Saathi Expense Tracker application.
You are assisting a user (ID: {user_id}). Below is their financial context for this month ({now.strftime('%B %Y')}):

- Monthly Budget Limit: ₹{budget_limit:.2f}
- Total Spent So Far: ₹{total_spent:.2f}
- Remaining Budget: ₹{budget_limit - total_spent:.2f}
- Spending Breakdown by Category: {breakdown_str}
- Recent Transactions:
{recent_str}

User Question: "{question}"

Instructions:
- Answer the user's question accurately using their provided data.
- If they ask about buying something (e.g. laptop for ₹50,000), analyze if they have enough remaining budget or savings, and advise them accordingly.
- Keep your tone friendly, professional, and clear.
- Keep the response relatively concise (2-4 sentences max). Use Rupees (₹) symbol.
"""
            response = model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            print(f"Gemini API Error: {e}. Falling back to rule-based assistant.")
            
    # 3. Rule-Based Fallback Assistant
    question_lower = question.lower()
    
    # Helper to parse category specific questions
    categories_list = ["food", "dining", "transport", "travel", "shopping", "entertainment", "bills", "utilities", "healthcare", "education"]
    matched_cat = None
    for cat in categories_list:
        if cat in question_lower:
            matched_cat = cat
            break
            
    if "most" in question_lower or "highest" in question_lower or "max" in question_lower:
        # Where did I spend the most?
        max_res = run_query(
            """SELECT c.name, SUM(e.amount) as total 
               FROM expenses e 
               JOIN categories c ON e.category_id = c.id 
               WHERE e.user_id = %s 
               GROUP BY c.name ORDER BY total DESC LIMIT 1""",
            (user_id,)
        )
        if max_res:
            return f"You spent the most on **{max_res[0]['name']}** with a total of **₹{max_res[0]['total']:.2f}**."
        return "I couldn't find any expenses logged yet. Add some transactions first!"
        
    elif "will i exceed" in question_lower or "overrun" in question_lower or "budget limit" in question_lower or "risk" in question_lower:
        # Will I exceed my budget?
        if budget_limit == 0:
            return "You haven't set a budget limit for this month yet. Go to the Budgeting tab to set one!"
        
        remaining = budget_limit - total_spent
        percentage = (total_spent / budget_limit) * 100
        
        if percentage >= 100:
            return f"Yes, you have already exceeded your budget of ₹{budget_limit:.2f} by ₹{-remaining:.2f}."
        elif percentage >= 80:
            return f"You are very close to exceeding your budget. You have spent ₹{total_spent:.2f} out of ₹{budget_limit:.2f} ({percentage:.1f}%), leaving you with only ₹{remaining:.2f}."
        else:
            return f"You are doing well! You have spent ₹{total_spent:.2f} of your ₹{budget_limit:.2f} budget ({percentage:.1f}%), leaving ₹{remaining:.2f} for the rest of the month."
            
    elif matched_cat:
        # Show specific expenses
        cat_res = run_query(
            """SELECT SUM(e.amount) as total 
               FROM expenses e 
               JOIN categories c ON e.category_id = c.id 
               WHERE e.user_id = %s AND c.name LIKE %s""",
            (user_id, f"%{matched_cat}%")
        )
        total_cat = cat_res[0]['total'] if cat_res and cat_res[0]['total'] else 0
        return f"Your total spending on categories related to '{matched_cat}' is **₹{total_cat:.2f}**."
        
    elif "buy" in question_lower or "afford" in question_lower:
        # Can I buy X?
        # Extract number
        numbers = re.findall(r'\d+', question_lower.replace(",", ""))
        if numbers:
            item_cost = float(numbers[0])
            remaining = budget_limit - total_spent
            if budget_limit == 0:
                return f"Since you haven't set a budget limit, it's hard to tell. However, you have spent ₹{total_spent:.2f} this month."
            
            if item_cost <= remaining:
                return f"Yes! You have ₹{remaining:.2f} remaining in your monthly budget, which is enough to buy this item for ₹{item_cost:.2f}."
            else:
                deficit = item_cost - remaining
                return f"No, I would recommend against it. You only have ₹{remaining:.2f} remaining in your budget, which is ₹{deficit:.2f} short of the ₹{item_cost:.2f} cost."
        return "Please specify the price of the item (e.g. 'Can I buy a laptop for ₹50,000?') so I can check your remaining budget."
        
    elif "compare" in question_lower or "last month" in question_lower:
        # Compare this month with last month
        last_month = current_month - 1 if current_month > 1 else 12
        last_year = current_year if current_month > 1 else current_year - 1
        
        last_month_res = run_query(
            "SELECT SUM(amount) as total FROM expenses WHERE user_id = %s AND EXTRACT(MONTH FROM date) = %s AND EXTRACT(YEAR FROM date) = %s",
            (user_id, last_month, last_year)
        )
        last_spent = float(last_month_res[0]['total']) if last_month_res and last_month_res[0]['total'] else 0.0
        
        diff = total_spent - last_spent
        if last_spent == 0:
            return f"You spent ₹{total_spent:.2f} this month. I don't have records of spending from last month to compare."
            
        pct_change = (diff / last_spent) * 100
        if diff > 0:
            return f"You spent ₹{total_spent:.2f} this month, which is **₹{diff:.2f} (+{pct_change:.1f}%) more** than last month (₹{last_spent:.2f})."
        else:
            return f"You spent ₹{total_spent:.2f} this month, which is **₹{-diff:.2f} ({pct_change:.1f}%) less** than last month (₹{last_spent:.2f}). Good job!"
            
    else:
        # Generic response
        return f"Hello! I am Budget Saathi AI. This month, you've spent ₹{total_spent:.2f} out of your ₹{budget_limit:.2f} budget. Let me know if you want to check your spending breakdown, compare months, or ask about purchasing items!"

def parse_ocr_text(ocr_text_list):
    """Uses regex to extract Amount, Date, and Merchant from a list of OCR strings."""
    full_text = " ".join(ocr_text_list)
    
    # 1. Extract Amount: look for decimal values (e.g. 50.00, 1250.50, ₹100.00)
    # Filter out common false positives like tax codes or rates
    amounts = []
    # Match patterns like 10.00, 1,000.00, etc.
    amount_matches = re.findall(r'(?:Rs\.?|INR|₹|[\s]|^)(\d{1,3}(?:,\d{3})*(?:\.\d{2}))', full_text, re.IGNORECASE)
    if not amount_matches:
        amount_matches = re.findall(r'\b\d+\.\d{2}\b', full_text)
        
    for match in amount_matches:
        try:
            val = float(match.replace(",", ""))
            # Ignore 0.00 or extremely small values unless nothing else exists
            if val > 0.5:
                amounts.append(val)
        except ValueError:
            continue
            
    # Typically, the total is the maximum amount listed on the receipt
    extracted_amount = max(amounts) if amounts else 0.0
    
    # 2. Extract Date: look for formats like DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, etc.
    extracted_date = None
    date_patterns = [
        r'\b(\d{2}[/\-]\d{2}[/\-]\d{4})\b', # 28/06/2026 or 28-06-2026
        r'\b(\d{4}[/\-]\d{2}[/\-]\d{2})\b', # 2026-06-28
        r'\b(\d{2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b' # 28 June 2026
    ]
    for pattern in date_patterns:
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            # Try to normalize it to ISO format (YYYY-MM-DD)
            for fmt in ('%d/%m/%Y', '%d-%m-%d', '%Y-%m-%d', '%Y/%m/%d', '%d %b %Y', '%d %B %Y'):
                try:
                    dt = datetime.strptime(date_str, fmt)
                    extracted_date = dt.strftime('%Y-%m-%dT%H:%M')
                    break
                except ValueError:
                    continue
            if extracted_date:
                break
                
    if not extracted_date:
        # Default to now if not found
        extracted_date = datetime.now().strftime('%Y-%m-%dT%H:%M')
        
    # 3. Extract Merchant Name: Usually the first non-trivial line in the list
    extracted_merchant = "Receipt Purchase"
    ignored_keywords = ["invoice", "receipt", "welcome", "tax", "bill", "date", "cashier", "store", "no:", "#", "tel"]
    for text in ocr_text_list:
        clean_text = text.strip()
        if len(clean_text) > 3 and not any(kw in clean_text.lower() for kw in ignored_keywords) and not re.search(r'^\d+$', clean_text):
            extracted_merchant = clean_text
            break
            
    return {
        "amount": extracted_amount,
        "merchant": extracted_merchant,
        "date": extracted_date
    }
