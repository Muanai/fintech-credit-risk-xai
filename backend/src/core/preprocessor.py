import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from imblearn.over_sampling import SMOTE


def prepare_german_data(filepath):
    df = pd.read_csv(filepath, sep='\t' if '\t' in open(filepath).readline() else ',')

    df['class'] = df['class'].map({'bad': 1, 'good': 0})

    df = df.drop(columns=['num_dependents', 'property_magnitude'])

    X = df.drop(columns=['class'])
    y = df['class']

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    num_cols = X_train.select_dtypes(include=['int64', 'float64']).columns.tolist()
    cat_cols = X_train.select_dtypes(exclude=['int64', 'float64']).columns.tolist()

    preprocessor = ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), num_cols),
            ('cat', OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False), cat_cols)
        ]
    )

    X_train_processed = preprocessor.fit_transform(X_train)
    X_test_processed = preprocessor.transform(X_test)

    smote = SMOTE(random_state=42)
    X_train_res, y_train_res = smote.fit_resample(X_train_processed, y_train)

    cat_feature_names = preprocessor.named_transformers_['cat'].get_feature_names_out(cat_cols)
    feature_names = num_cols + list(cat_feature_names)

    return X_train_res, X_test_processed, y_train_res, y_test, feature_names


def prepare_give_me_some_credit(filepath):
    df = pd.read_csv(filepath, index_col=0)

    df.loc[df['age'] < 18, 'age'] = np.nan
    df.loc[df['DebtRatio'] > 10, 'DebtRatio'] = 10

    income_99th = df['MonthlyIncome'].quantile(0.99)
    df.loc[df['MonthlyIncome'] > income_99th, 'MonthlyIncome'] = income_99th

    X = df.drop(columns=['SeriousDlqin2yrs'])
    y = df['SeriousDlqin2yrs']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    num_cols = X_train.columns.tolist()

    pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler())
    ])

    X_train_processed = pipeline.fit_transform(X_train)
    X_test_processed = pipeline.transform(X_test)

    smote = SMOTE(random_state=42)
    X_train_res, y_train_res = smote.fit_resample(X_train_processed, y_train)

    feature_names = num_cols

    return X_train_res, X_test_processed, y_train_res, y_test, feature_names


def prepare_give_me_some_credit_grandmaster(filepath):
    df = pd.read_csv(filepath, index_col=0)

    df.loc[df['age'] < 18, 'age'] = np.nan

    past_due_cols = [
        'NumberOfTime30-59DaysPastDueNotWorse',
        'NumberOfTime60-89DaysPastDueNotWorse',
        'NumberOfTimes90DaysLate'
    ]

    for col in past_due_cols:
        df[f'{col}_is_96_or_98'] = df[col].isin([96, 98]).astype(int)
        df.loc[df[col] >= 96, col] = np.nan

    df['Income_Missing_Flag'] = df['MonthlyIncome'].isna().astype(int)

    df['Monthly_Debt'] = df['DebtRatio'] * df['MonthlyIncome']
    df['Income_Per_Dependent'] = df['MonthlyIncome'] / (df['NumberOfDependents'] + 1)

    X = df.drop(columns=['SeriousDlqin2yrs'])
    y = df['SeriousDlqin2yrs']

    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    return X_train, X_test, y_train, y_test, X.columns.tolist()


def prepare_credit_classification(filepath):
    df = pd.read_csv(filepath, low_memory=False)

    df['Target'] = df['Credit_Score'].apply(lambda x: 1 if x == 'Poor' else 0)

    drop_cols = ['ID', 'Customer_ID', 'Month', 'Name', 'SSN', 'Type_of_Loan', 'Credit_Score']
    df = df.drop(columns=drop_cols, errors='ignore')

    num_str_cols = ['Age', 'Annual_Income', 'Num_of_Loan', 'Delay_from_due_date',
                    'Num_of_Delayed_Payment', 'Changed_Credit_Limit',
                    'Outstanding_Debt', 'Amount_invested_monthly', 'Monthly_Balance']

    for col in num_str_cols:
        df[col] = df[col].astype(str).str.replace(r'[^\d.-]', '', regex=True)
        df[col] = df[col].replace(r'^[.-]*$', np.nan, regex=True)
        df[col] = pd.to_numeric(df[col], errors='coerce').astype(float)

    df.loc[(df['Age'] < 0) | (df['Age'] > 100), 'Age'] = np.nan

    def extract_months(text):
        if pd.isna(text):
            return np.nan
        try:
            parts = str(text).split(' ')
            return (int(parts[0]) * 12) + int(parts[3])
        except:
            return np.nan

    df['Credit_History_Age_Months'] = df['Credit_History_Age'].apply(extract_months)
    df = df.drop(columns=['Credit_History_Age'], errors='ignore')

    df['Credit_Mix'] = df['Credit_Mix'].replace('_', np.nan)
    df['Payment_Behaviour'] = df['Payment_Behaviour'].replace('!@9#%8', np.nan)
    df['Payment_of_Min_Amount'] = df['Payment_of_Min_Amount'].replace('NM', np.nan)

    X = df.drop(columns=['Target'])
    y = df['Target']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    num_cols = X_train.select_dtypes(include=['float64', 'int64', 'float32', 'int32']).columns.tolist()
    cat_cols = X_train.select_dtypes(exclude=['float64', 'int64', 'float32', 'int32']).columns.tolist()

    num_pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler())
    ])

    cat_pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='most_frequent')),
        ('encoder', OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False, min_frequency=0.01))
    ])

    preprocessor = ColumnTransformer([
        ('num', num_pipeline, num_cols),
        ('cat', cat_pipeline, cat_cols)
    ])

    X_train_processed = preprocessor.fit_transform(X_train)
    X_test_processed = preprocessor.transform(X_test)

    cat_feature_names = preprocessor.named_transformers_['cat'].named_steps['encoder'].get_feature_names_out(cat_cols)
    feature_names = num_cols + list(cat_feature_names)

    return X_train_processed, X_test_processed, y_train, y_test, feature_names
