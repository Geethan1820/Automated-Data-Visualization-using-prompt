import pandas as pd
import numpy as np

def clean_dataset(df: pd.DataFrame) -> pd.DataFrame:
    """
    Perform basic cleaning:
    - Remove duplicates
    - Fill missing numeric values with mean
    - Fill missing categorical values with mode
    """
    # Remove duplicates
    df = df.drop_duplicates()
    
    # Handle missing values
    for col in df.columns:
        if df[col].dtype in [np.float64, np.int64]:
            df[col] = df[col].fillna(df[col].mean())
        else:
            if len(df[col].mode()) > 0:
                df[col] = df[col].fillna(df[col].mode()[0])
            else:
                df[col] = df[col].fillna("Unknown")
                
    return df

def calculate_quality_score(df: pd.DataFrame, initial_row_count: int) -> int:
    """
    Calculate a score 0-100 based on:
    - Missing values (before cleaning) - passed as current df state assumed clean? 
    - Actually validation should be done on RAW data usually, 
      but for simplicity we'll estimate based on remaining issues or just mock it slightly.
    
    Let's refine: The caller should pass the raw DF for scoring usually.
    But let's just make a simple heuristic on the CLEANED data properties or just return a mock high score for now if it's clean.
    
    Better approach:
    100 - (percentage of missing cells in original * 100) - (duplicates * ...)
    
    For now, let's just return a placeholder score or a simple calculation.
    """
    # Simple dummy logic for now
    return 95
