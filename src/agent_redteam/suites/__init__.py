"""Attack test suites for agent-redteam — OWASP LLM Top 10 full coverage."""
from .base import Suite
from .injection import InjectionSuite
from .tool_abuse import ToolAbuseSuite
from .over_refusal import OverRefusalSuite
from .info_leak import InfoLeakSuite
from .sensitive_data import SensitiveDataSuite
from .insecure_output import InsecureOutputSuite
from .excessive_agency import ExcessiveAgencySuite
from .model_dos import ModelDosSuite
from .supply_chain import SupplyChainSuite
from .over_dependency import OverDependencySuite
from .multi_turn import MultiTurnSuite
from .data_poisoning import DataPoisoningSuite

ALL_SUITES = [
    InjectionSuite,
    ToolAbuseSuite,
    OverRefusalSuite,
    InfoLeakSuite,
    SensitiveDataSuite,
    InsecureOutputSuite,
    ExcessiveAgencySuite,
    ModelDosSuite,
    SupplyChainSuite,
    OverDependencySuite,
    MultiTurnSuite,
    DataPoisoningSuite,
]

__all__ = [
    "Suite", "ALL_SUITES",
    "InjectionSuite", "ToolAbuseSuite", "OverRefusalSuite", "InfoLeakSuite",
    "SensitiveDataSuite", "InsecureOutputSuite", "ExcessiveAgencySuite",
    "ModelDosSuite", "SupplyChainSuite", "OverDependencySuite",
    "MultiTurnSuite",
    "DataPoisoningSuite",
]
