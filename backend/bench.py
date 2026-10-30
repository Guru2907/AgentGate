import os
import yaml
import tempfile
from pathlib import Path
from typing import Callable
from backend import db
from backend.schemas import RunResult

CASES_PATH = Path(__file__).resolve().parent.parent / "data" / "bench_cases.yaml"

def run_bench(
    process: Callable,
    propose: Callable,
    read_doc: Callable,
    resolve_doc: Callable,
    cases_path: Path = CASES_PATH,
) -> dict:
    with open(cases_path, "r") as f:
        data = yaml.safe_load(f)
    
    cases = data.get("cases", [])
    
    # Temp DB setup to avoid polluting the main audit log
    old_db_path = os.environ.get("DB_PATH")
    temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    temp_db.close()
    os.environ["DB_PATH"] = temp_db.name
    db.init_db()
    
    # Force replay mode for doc cases so no API keys/internet are needed
    old_agent = os.environ.get("AGENT")
    old_llm_mode = os.environ.get("LLM_MODE")
    os.environ["AGENT"] = "llm"
    os.environ["LLM_MODE"] = "replay"

    results = []
    attacks_blocked = 0
    attacks_passed = 0
    clean_allowed = 0
    false_alarms = 0

    try:
        for case in cases:
            name = case["name"]
            kind = case["kind"]
            task = case["task"]
            expected = case["expected"]
            
            if "doc" in case:
                doc_path = case["doc"]
                text = read_doc(resolve_doc(doc_path))
                raw_calls = propose(task, text, doc_path)
                source = "run"
                doc_arg = doc_path
            else:
                raw_calls = case["calls"]
                source = "inject"
                doc_arg = "(bench)"
                text = ""
                
            res: RunResult = process(task, doc_arg, raw_calls, source)
            
            # Evaluate the verdict of the LAST call for multi-step sequences
            got = res.decisions[-1].verdict if res.decisions else "BLOCK"
            rules = res.decisions[-1].rules if res.decisions else []
            
            passed = (got == expected)
            
            if kind == "hostile":
                if got in ("BLOCK", "REVIEW"):
                    attacks_blocked += 1
                elif got == "ALLOW":
                    attacks_passed += 1
            elif kind == "clean":
                if got == "ALLOW":
                    clean_allowed += 1
                elif got in ("BLOCK", "REVIEW"):
                    false_alarms += 1
                    
            results.append({
                "name": name,
                "kind": kind,
                "task": task,
                "expected": expected,
                "got": got,
                "rules": rules,
                "pass": passed
            })
            
    finally:
        # Restore environment variables
        if old_db_path is not None:
            os.environ["DB_PATH"] = old_db_path
        else:
            os.environ.pop("DB_PATH", None)
            
        if old_agent is not None:
            os.environ["AGENT"] = old_agent
        else:
            os.environ.pop("AGENT", None)
            
        if old_llm_mode is not None:
            os.environ["LLM_MODE"] = old_llm_mode
        else:
            os.environ.pop("LLM_MODE", None)
            
        # Clean up temp db file
        try:
            os.unlink(temp_db.name)
        except OSError:
            pass

    total = len(cases)
    return {
        "total": total,
        "attacks_blocked": attacks_blocked,
        "attacks_passed": attacks_passed,
        "clean_allowed": clean_allowed,
        "false_alarms": false_alarms,
        "per_case": results
    }