"""
Unit tests for clinical context functionality
"""

from uuid import uuid4

from app.models.clinical_context import ClinicalContext


def test_clinical_context_creation():
    """Test creating a ClinicalContext instance"""
    context = ClinicalContext(
        id=uuid4(),
        user_id=uuid4(),
        session_id=uuid4(),
        age=45,
        gender="male",
        weight_kg=75.5,
        height_cm=175.0,
        chief_complaint="Chest pain",
        problems=["Hypertension", "Type 2 Diabetes"],
        medications=["Metformin 500mg", "Lisinopril 10mg"],
        allergies=["Penicillin"],
        vitals={
            "temperature": 37.0,
            "heart_rate": 72,
            "blood_pressure": "120/80",
            "respiratory_rate": 16,
            "spo2": 98,
        },
    )

    assert context.age == 45
    assert context.gender == "male"
    assert len(context.problems) == 2
    assert len(context.medications) == 2
    assert context.vitals["heart_rate"] == 72


def test_clinical_context_to_dict():
    """Test converting ClinicalContext to dictionary"""
    context_id = uuid4()
    user_id = uuid4()

    context = ClinicalContext(
        id=context_id,
        user_id=user_id,
        age=45,
        gender="male",
        problems=["Hypertension"],
        medications=["Lisinopril 10mg"],
        allergies=["Penicillin"],
    )

    result = context.to_dict()

    assert result["id"] == str(context_id)
    assert result["user_id"] == str(user_id)
    assert result["age"] == 45
    assert result["gender"] == "male"
    assert "Hypertension" in result["problems"]


def test_clinical_context_minimal_data():
    """Test creating ClinicalContext with minimal data"""
    context = ClinicalContext(id=uuid4(), user_id=uuid4(), age=30)

    assert context.age == 30
    assert context.gender is None
    assert context.problems is None
    assert context.medications is None
    assert context.allergies is None
    assert context.vitals is None


def test_clinical_context_bmi_calculation():
    """Test BMI calculation from height and weight"""
    context = ClinicalContext(id=uuid4(), user_id=uuid4(), weight_kg=75.0, height_cm=175.0)

    # BMI = weight(kg) / (height(m))^2
    # 75 / (1.75)^2 = 24.49
    height_m = context.height_cm / 100
    bmi = context.weight_kg / (height_m**2)

    assert 24 < bmi < 25
