"""
Unit tests for Medical AI Services

Tests for:
- MedicalEmbeddingService
- MedicalNERService
- MultiHopReasoner
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Test MedicalEmbeddingService


class TestMedicalEmbeddingService:
    """Tests for medical embedding service"""

    def test_service_initialization(self):
        """Test service initializes with lazy loading"""
        from app.services.medical_embedding_service import MedicalEmbeddingService

        service = MedicalEmbeddingService(lazy_load=True)

        assert service._lazy_load is True
        assert service._models_loaded is False
        assert service._fallback_enabled is True

    def test_model_configs(self):
        """Test model configurations are correctly defined"""
        from app.services.medical_embedding_service import MODEL_CONFIGS, MedicalModelType

        # All model types should have configs
        assert MedicalModelType.PUBMEDBERT in MODEL_CONFIGS
        assert MedicalModelType.BIOGPT in MODEL_CONFIGS
        assert MedicalModelType.SCIBERT in MODEL_CONFIGS

        # PubMedBERT config
        pubmed_config = MODEL_CONFIGS[MedicalModelType.PUBMEDBERT]
        assert pubmed_config.name == "PubMedBERT"
        assert pubmed_config.embedding_dim == 768
        assert pubmed_config.supports_generation is False

        # BioGPT config
        biogpt_config = MODEL_CONFIGS[MedicalModelType.BIOGPT]
        assert biogpt_config.name == "BioGPT"
        assert biogpt_config.embedding_dim == 1024
        assert biogpt_config.supports_generation is True

    def test_embedding_result_dataclass(self):
        """Test EmbeddingResult dataclass"""
        from app.services.medical_embedding_service import EmbeddingResult

        result = EmbeddingResult(
            embedding=[0.1, 0.2, 0.3],
            model="PubMedBERT",
            text_length=100,
            truncated=False,
            metadata={"pooling": "cls"},
        )

        assert len(result.embedding) == 3
        assert result.model == "PubMedBERT"
        assert result.truncated is False

    def test_get_model_info(self):
        """Test getting model information"""
        from app.services.medical_embedding_service import MedicalEmbeddingService, MedicalModelType

        service = MedicalEmbeddingService(lazy_load=True)
        info = service.get_model_info(MedicalModelType.PUBMEDBERT)

        assert info["name"] == "PubMedBERT"
        assert info["embedding_dim"] == 768
        assert info["loaded"] is False

    def test_get_available_models(self):
        """Test listing available models"""
        from app.services.medical_embedding_service import MedicalEmbeddingService

        service = MedicalEmbeddingService(lazy_load=True)
        models = service.get_available_models()

        assert len(models) == 3
        model_names = [m["name"] for m in models]
        assert "PubMedBERT" in model_names
        assert "BioGPT" in model_names
        assert "SciBERT" in model_names

    @pytest.mark.asyncio
    async def test_fallback_embedding_structure(self):
        """Test fallback embedding returns correct structure"""
        from app.services.medical_embedding_service import MedicalEmbeddingService, MedicalModelType

        service = MedicalEmbeddingService(lazy_load=True)
        service._fallback_enabled = True

        # Mock httpx to avoid real API call
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.json.return_value = {"data": [{"embedding": [0.1] * 1536}]}
            mock_response.raise_for_status = MagicMock()

            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock()
            mock_client.return_value = mock_client_instance

            result = await service._fallback_embedding("test text", MedicalModelType.PUBMEDBERT)

            assert result.model == "text-embedding-3-small (fallback)"
            assert result.metadata["fallback"] is True


# Test MedicalNERService


class TestMedicalNERService:
    """Tests for medical NER service"""

    def test_service_initialization(self):
        """Test NER service initializes with lazy loading"""
        from app.services.medical_ner_service import MedicalNERService

        service = MedicalNERService(lazy_load=True)

        assert service._lazy_load is True
        assert service._nlp_loaded is False

    def test_entity_types(self):
        """Test entity type enum values"""
        from app.services.medical_ner_service import EntityType

        assert EntityType.DISEASE.value == "DISEASE"
        assert EntityType.MEDICATION.value == "MEDICATION"
        assert EntityType.PROCEDURE.value == "PROCEDURE"
        assert EntityType.ANATOMY.value == "ANATOMY"
        assert EntityType.SYMPTOM.value == "SYMPTOM"
        assert EntityType.LAB_TEST.value == "LAB_TEST"
        assert EntityType.GENE.value == "GENE"

    def test_ontology_types(self):
        """Test ontology type enum values"""
        from app.services.medical_ner_service import OntologyType

        assert OntologyType.ICD10.value == "ICD-10"
        assert OntologyType.RXNORM.value == "RxNorm"
        assert OntologyType.SNOMED.value == "SNOMED-CT"
        assert OntologyType.MESH.value == "MeSH"
        assert OntologyType.LOINC.value == "LOINC"

    def test_medical_entity_dataclass(self):
        """Test MedicalEntity dataclass"""
        from app.services.medical_ner_service import EntityType, MedicalEntity

        entity = MedicalEntity(
            text="hypertension",
            entity_type=EntityType.DISEASE,
            start_char=0,
            end_char=12,
            negated=False,
            uncertain=False,
        )

        assert entity.text == "hypertension"
        assert entity.entity_type == EntityType.DISEASE
        assert entity.negated is False
        assert len(entity.umls_concepts) == 0

    def test_semantic_type_mapping(self):
        """Test UMLS semantic type to entity type mapping"""
        from app.services.medical_ner_service import SEMANTIC_TYPE_MAPPING, EntityType

        # Disease types
        assert SEMANTIC_TYPE_MAPPING["T047"] == EntityType.DISEASE
        assert SEMANTIC_TYPE_MAPPING["T191"] == EntityType.DISEASE

        # Medication types
        assert SEMANTIC_TYPE_MAPPING["T121"] == EntityType.MEDICATION
        assert SEMANTIC_TYPE_MAPPING["T200"] == EntityType.MEDICATION

        # Procedure types
        assert SEMANTIC_TYPE_MAPPING["T061"] == EntityType.PROCEDURE

    def test_get_entity_type(self):
        """Test entity type determination from semantic types"""
        from app.services.medical_ner_service import EntityType, MedicalNERService

        service = MedicalNERService(lazy_load=True)

        # Should return DISEASE for disease semantic type
        assert service._get_entity_type(["T047"]) == EntityType.DISEASE

        # Should return MEDICATION for drug semantic type
        assert service._get_entity_type(["T121"]) == EntityType.MEDICATION

        # Should return UNKNOWN for unmapped types
        assert service._get_entity_type(["T999"]) == EntityType.UNKNOWN

    def test_negation_detection(self):
        """Test negation span detection"""
        from app.services.medical_ner_service import MedicalNERService

        service = MedicalNERService(lazy_load=True)

        # Create mock doc
        class MockDoc:
            text = "Patient denies chest pain and has no fever."

        doc = MockDoc()
        spans = service._detect_negation_spans(doc)

        # Should detect negation spans
        assert len(spans) > 0

    def test_uncertainty_detection(self):
        """Test uncertainty marker detection"""
        from app.services.medical_ner_service import MedicalNERService

        service = MedicalNERService(lazy_load=True)

        # Text with uncertainty
        text = "possible pneumonia was noted"
        is_uncertain = service._is_uncertain(text, 9, 18)  # "pneumonia"
        assert is_uncertain is True

        # Text without uncertainty
        text2 = "confirmed diagnosis of pneumonia"
        is_uncertain2 = service._is_uncertain(text2, 22, 31)  # "pneumonia"
        assert is_uncertain2 is False

    def test_context_window(self):
        """Test context window extraction"""
        from app.services.medical_ner_service import MedicalNERService

        service = MedicalNERService(lazy_load=True)

        text = "The patient was diagnosed with hypertension last year."
        context = service._get_context_window(text, 31, 43, window=10)

        assert "hypertension" in context
        assert len(context) <= 43 - 31 + 20  # entity + 2*window

    def test_result_to_dict(self):
        """Test converting NER result to dictionary"""
        from app.services.medical_ner_service import EntityType, MedicalEntity, MedicalNERService, NERResult

        service = MedicalNERService(lazy_load=True)

        entity = MedicalEntity(
            text="diabetes",
            entity_type=EntityType.DISEASE,
            start_char=0,
            end_char=8,
            negated=False,
            uncertain=True,
        )

        result = NERResult(
            entities=[entity],
            text_length=100,
            processing_time_ms=50.0,
            model_used="en_core_sci_lg",
        )

        result_dict = service.result_to_dict(result)

        assert len(result_dict["entities"]) == 1
        assert result_dict["entities"][0]["text"] == "diabetes"
        assert result_dict["entities"][0]["uncertain"] is True
        assert result_dict["processing_time_ms"] == 50.0

    def test_classify_entity_by_label(self):
        """Test entity classification by spacy label"""
        from app.services.medical_ner_service import EntityType, MedicalNERService

        service = MedicalNERService(lazy_load=True)

        assert service._classify_entity_by_label("DISEASE") == EntityType.DISEASE
        assert service._classify_entity_by_label("DRUG") == EntityType.MEDICATION
        assert service._classify_entity_by_label("GENE") == EntityType.GENE
        assert service._classify_entity_by_label("UNKNOWN_LABEL") == EntityType.UNKNOWN


# Test MultiHopReasoner


class TestMultiHopReasoner:
    """Tests for multi-hop reasoning service"""

    def test_search_result_dataclass(self):
        """Test SearchResult dataclass"""
        from app.services.multi_hop_reasoning_service import SearchResult

        result = SearchResult(
            doc_id="doc_001",
            content="Test content",
            score=0.95,
            metadata={"source": "test"},
            source="semantic",
        )

        assert result.doc_id == "doc_001"
        assert result.score == 0.95
        assert result.source == "semantic"

    def test_reasoning_strategy_enum(self):
        """Test reasoning strategy enum values"""
        from app.services.multi_hop_reasoning_service import ReasoningStrategy

        assert ReasoningStrategy.DIRECT.value == "direct"
        assert ReasoningStrategy.MULTI_HOP.value == "multi_hop"
        assert ReasoningStrategy.COMPARATIVE.value == "comparative"
        assert ReasoningStrategy.CAUSAL.value == "causal"
        assert ReasoningStrategy.TEMPORAL.value == "temporal"

    def test_reasoning_step_dataclass(self):
        """Test ReasoningStep dataclass"""
        from app.services.multi_hop_reasoning_service import ReasoningStep

        step = ReasoningStep(
            step_number=1,
            question="What causes hypertension?",
            retrieved_docs=["doc_001", "doc_002"],
            answer="Hypertension can be caused by...",
            confidence=0.85,
            sources=["Source A", "Source B"],
        )

        assert step.step_number == 1
        assert len(step.retrieved_docs) == 2
        assert step.confidence == 0.85

    def test_strategy_detection_comparative(self):
        """Test detecting comparative queries"""
        from app.services.multi_hop_reasoning_service import MultiHopReasoner, ReasoningStrategy

        reasoner = MultiHopReasoner()

        query = "Compare ACE inhibitors versus beta blockers for hypertension"
        strategy = reasoner._detect_strategy(query)
        assert strategy == ReasoningStrategy.COMPARATIVE

        query2 = "What is the difference between Type 1 and Type 2 diabetes?"
        strategy2 = reasoner._detect_strategy(query2)
        assert strategy2 == ReasoningStrategy.COMPARATIVE

    def test_strategy_detection_causal(self):
        """Test detecting causal queries"""
        from app.services.multi_hop_reasoning_service import MultiHopReasoner, ReasoningStrategy

        reasoner = MultiHopReasoner()

        query = "Why does smoking cause lung cancer?"
        strategy = reasoner._detect_strategy(query)
        assert strategy == ReasoningStrategy.CAUSAL

        query2 = "What leads to insulin resistance?"
        strategy2 = reasoner._detect_strategy(query2)
        assert strategy2 == ReasoningStrategy.CAUSAL

    def test_strategy_detection_temporal(self):
        """Test detecting temporal queries"""
        from app.services.multi_hop_reasoning_service import MultiHopReasoner, ReasoningStrategy

        reasoner = MultiHopReasoner()

        query = "What is the timeline for heart attack recovery?"
        strategy = reasoner._detect_strategy(query)
        assert strategy == ReasoningStrategy.TEMPORAL

        query2 = "What are the stages of cancer progression?"
        strategy2 = reasoner._detect_strategy(query2)
        assert strategy2 == ReasoningStrategy.TEMPORAL

    def test_strategy_detection_direct(self):
        """Test detecting direct/simple queries"""
        from app.services.multi_hop_reasoning_service import MultiHopReasoner, ReasoningStrategy

        reasoner = MultiHopReasoner()

        query = "What is hypertension?"
        strategy = reasoner._detect_strategy(query)
        assert strategy == ReasoningStrategy.DIRECT

    def test_confidence_calculation(self):
        """Test confidence score calculation"""
        from app.services.multi_hop_reasoning_service import MultiHopReasoner, ReasoningStep

        reasoner = MultiHopReasoner()

        # Empty chain
        assert reasoner._calculate_confidence([]) == 0.0

        # Single step chain
        chain = [
            ReasoningStep(
                step_number=1,
                question="Q1",
                retrieved_docs=[],
                answer="A1",
                confidence=0.8,
                sources=[],
            )
        ]
        conf = reasoner._calculate_confidence(chain)
        assert 0.8 <= conf <= 0.9  # 0.8 + small bonus

        # Multi-step chain
        chain2 = [
            ReasoningStep(step_number=1, question="Q1", retrieved_docs=[], answer="A1", confidence=0.7, sources=[]),
            ReasoningStep(step_number=2, question="Q2", retrieved_docs=[], answer="A2", confidence=0.8, sources=[]),
            ReasoningStep(step_number=3, question="Q3", retrieved_docs=[], answer="A3", confidence=0.9, sources=[]),
        ]
        conf2 = reasoner._calculate_confidence(chain2)
        assert conf2 > conf  # Should be higher with more steps

    def test_step_confidence_calculation(self):
        """Test per-step confidence calculation"""
        from app.services.multi_hop_reasoning_service import MultiHopReasoner, SearchResult

        reasoner = MultiHopReasoner()

        # No results = low confidence
        conf_no_results = reasoner._calculate_step_confidence([], "Some answer")
        assert conf_no_results == 0.3

        # With results
        results = [
            SearchResult("d1", "content", 0.9, {}, "semantic"),
            SearchResult("d2", "content", 0.8, {}, "semantic"),
        ]
        conf_with_results = reasoner._calculate_step_confidence(results, "A detailed answer")
        assert conf_with_results > 0.5

        # Short answer penalty
        conf_short = reasoner._calculate_step_confidence(results, "Yes")
        assert conf_short < conf_with_results

    def test_result_to_dict(self):
        """Test converting reasoning result to dictionary"""
        from app.services.multi_hop_reasoning_service import (
            MultiHopReasoner,
            ReasoningResult,
            ReasoningStep,
            ReasoningStrategy,
        )

        reasoner = MultiHopReasoner()

        step = ReasoningStep(
            step_number=1,
            question="What is diabetes?",
            retrieved_docs=["doc_001"],
            answer="Diabetes is a metabolic disease...",
            confidence=0.85,
            sources=["Medical Encyclopedia"],
        )

        result = ReasoningResult(
            original_query="Explain diabetes",
            strategy=ReasoningStrategy.DIRECT,
            reasoning_chain=[step],
            final_answer="Diabetes is a metabolic disease...",
            confidence=0.85,
            sources=["Medical Encyclopedia"],
        )

        result_dict = reasoner.to_dict(result)

        assert result_dict["original_query"] == "Explain diabetes"
        assert result_dict["strategy"] == "direct"
        assert len(result_dict["reasoning_chain"]) == 1
        assert result_dict["confidence"] == 0.85


# Test HybridSearchEngine


class TestHybridSearchEngine:
    """Tests for hybrid search engine"""

    def test_search_engine_initialization(self):
        """Test search engine initializes with lazy loading"""
        from app.services.multi_hop_reasoning_service import HybridSearchEngine

        engine = HybridSearchEngine(lazy_load=True)

        assert engine._lazy_load is True
        assert engine._loaded is False

    @pytest.mark.asyncio
    async def test_query_expansion(self):
        """Test medical query expansion"""
        from app.services.multi_hop_reasoning_service import HybridSearchEngine

        engine = HybridSearchEngine(lazy_load=True)

        # Test heart attack synonym expansion
        expanded = await engine._expand_query("heart attack treatment")
        assert "myocardial infarction" in expanded or "MI" in expanded

        # Test diabetes expansion
        expanded2 = await engine._expand_query("diabetes management")
        assert "diabetes mellitus" in expanded2 or "DM" in expanded2

        # Test no expansion needed
        expanded3 = await engine._expand_query("rare condition xyz")
        assert expanded3 == "rare condition xyz"

    def test_reciprocal_rank_fusion(self):
        """Test RRF score calculation"""
        from app.services.multi_hop_reasoning_service import HybridSearchEngine, SearchResult

        engine = HybridSearchEngine(lazy_load=True)

        semantic_results = [
            SearchResult("doc1", "content1", 0.9, {}, "semantic"),
            SearchResult("doc2", "content2", 0.8, {}, "semantic"),
            SearchResult("doc3", "content3", 0.7, {}, "semantic"),
        ]

        keyword_results = [
            SearchResult("doc2", "content2", 0.85, {}, "keyword"),
            SearchResult("doc4", "content4", 0.75, {}, "keyword"),
            SearchResult("doc1", "content1", 0.65, {}, "keyword"),
        ]

        fused = engine._reciprocal_rank_fusion(semantic_results, keyword_results, alpha=0.5)

        # doc1 and doc2 should appear in both, so they should have higher scores
        doc_ids = [r.doc_id for r in fused]
        assert "doc1" in doc_ids
        assert "doc2" in doc_ids

        # All results should be marked as hybrid
        for r in fused:
            assert r.source == "hybrid"

    def test_rrf_alpha_weighting(self):
        """Test RRF alpha parameter affects weighting"""
        from app.services.multi_hop_reasoning_service import HybridSearchEngine, SearchResult

        engine = HybridSearchEngine(lazy_load=True)

        semantic_only = [
            SearchResult("sem1", "content", 0.9, {}, "semantic"),
        ]
        keyword_only = [
            SearchResult("key1", "content", 0.9, {}, "keyword"),
        ]

        # Alpha = 1.0 (pure semantic)
        fused_semantic = engine._reciprocal_rank_fusion(semantic_only, keyword_only, alpha=1.0)
        sem_score = next(r.score for r in fused_semantic if r.doc_id == "sem1")
        key_score = next(r.score for r in fused_semantic if r.doc_id == "key1")
        assert sem_score > key_score

        # Alpha = 0.0 (pure keyword)
        fused_keyword = engine._reciprocal_rank_fusion(semantic_only, keyword_only, alpha=0.0)
        sem_score2 = next(r.score for r in fused_keyword if r.doc_id == "sem1")
        key_score2 = next(r.score for r in fused_keyword if r.doc_id == "key1")
        assert key_score2 > sem_score2


# Integration tests (marked for optional running)


class TestMedicalAIIntegration:
    """Integration tests requiring model loading"""

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_full_ner_pipeline(self):
        """Test full NER pipeline with real model"""
        from app.services.medical_ner_service import MedicalNERService

        service = MedicalNERService(lazy_load=True)

        # Only run if model can be loaded
        if not service._load_model():
            pytest.skip("NER model not available")

        text = "Patient diagnosed with type 2 diabetes and hypertension."
        result = await service.extract_entities(text)

        assert len(result.entities) > 0
        assert result.processing_time_ms > 0

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_full_embedding_pipeline(self):
        """Test full embedding pipeline with real model"""
        from app.services.medical_embedding_service import MedicalEmbeddingService, MedicalModelType

        service = MedicalEmbeddingService(lazy_load=True)

        # Only run if model can be loaded
        if not service._load_model(MedicalModelType.PUBMEDBERT):
            pytest.skip("Embedding model not available")

        result = await service.generate_embedding(
            "Hypertension is a risk factor for cardiovascular disease.",
            MedicalModelType.PUBMEDBERT,
        )

        assert len(result.embedding) == 768
        assert result.model == "PubMedBERT"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
