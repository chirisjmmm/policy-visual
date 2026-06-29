#!/usr/bin/env python3
"""Process raw scenario_*.json simulation logs into a compact, front-end-friendly
JSON that focuses ONLY on the forward -> backward pass (the configuration that
produced the best macro-average in our study).

Output: web/data/simulation.json

For each scenario we extract, per IAD logic-model phase (Inputs..Impact):
  - each agent's *initial* forward estimate (to expose disagreement / outliers)
  - the *refined* forward consensus value (to show convergence)
  - the backward (bottom-up) aggregate and the forward<->backward consistency
  - a short rationale snippet per agent
This is what the round-table view animates.
"""
import json, os, re, statistics

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "raw_data")

# Human-readable labels / units for every prediction variable seen in the logs.
VAR_META = {
    "total_annual_budget_krw":      ("연간 총 예산", "원", "budget"),
    "fellowship_slots":             ("펠로우십 선정 인원", "명", "count"),
    "regional_quota_pct":           ("지역 할당 비율", "%", "pct"),
    "applications_received":        ("지원서 접수", "건", "count"),
    "fellows_selected":             ("최종 선정 인원", "명", "count"),
    "midterm_evaluations_passed":   ("단계평가 통과", "명", "count"),
    "fellows_active":               ("활동 중 펠로우", "명", "count"),
    "stage_two_fellows":            ("2단계 진입 펠로우", "명", "count"),
    "annual_reports_submitted":     ("연차보고서 제출", "건", "count"),
    "regional_institution_participation_pct": ("지역기관 참여 비율", "%", "pct"),
    "number_of_sci_e_publications_in_2021_2022": ("SCI(E) 논문 수", "편", "count"),
    "sci_publications_count":       ("SCI 논문 수", "편", "count"),
    "tenure_track_transition_rate": ("정년트랙 전환율", "%", "pct"),
    "former_fellows_in_tenure_track": ("정년트랙 진입 펠로우", "명", "count"),
    "regional_publication_share_growth": ("지역 논문 점유율 증가", "%p", "pct"),
    "independent_pi_count":         ("독립 연구책임자(PI) 수", "명", "count"),
}

PHASE_META = {
    "Inputs":     ("투입", "Inputs", "정책에 투입되는 예산·정원·제도적 조건"),
    "Activities": ("활동", "Activities", "선발·평가 등 정책이 수행하는 활동"),
    "Outputs":    ("산출", "Outputs", "활동의 직접적 산출물"),
    "Outcomes":   ("성과", "Outcomes", "수혜자에게 나타나는 중기 성과"),
    "Impact":     ("영향", "Impact", "사회·학계에 미치는 장기 영향"),
}

STAKEHOLDER_KO = {
    "EvaluationPanel": "평가위원",
    "PolicyRole": "정책담당자",
    "PostdoctoralResearcher": "박사후연구원",
}
STAKEHOLDER_COLOR = {
    "EvaluationPanel": "#6366f1",       # indigo
    "PolicyRole": "#0ea5e9",            # sky
    "PostdoctoralResearcher": "#f59e0b",# amber
}


def first_sentences(text, max_len=180):
    if not text:
        return ""
    text = text.strip().replace("\n", " ")
    # cut at sentence boundary near max_len
    if len(text) <= max_len:
        return text
    cut = text[:max_len]
    m = re.search(r"^.*[.!?](?=\s|$)", cut[::-1])  # not robust; simple fallback
    # simpler: cut at last period before max_len
    idx = cut.rfind(". ")
    if idx > 60:
        return cut[: idx + 1]
    return cut.rstrip() + "…"


def collect_phase(fp_phase):
    """Return dict of variable -> list of (agent, value) from initial_posts,
    plus refined consensus per variable, plus posting order."""
    initial = {}
    for p in fp_phase.get("initial_posts") or []:
        pv = p.get("prediction_values") or {}
        for k, v in pv.items():
            initial.setdefault(k, []).append((p["persona_name"], v))
    refined = {}
    rposts = fp_phase.get("refined_posts") or fp_phase.get("revised_posts") or []
    for p in rposts:
        pv = p.get("prediction_values") or {}
        for k, v in pv.items():
            refined.setdefault(k, []).append(v)
    consensus = {}
    for k, vals in refined.items():
        try:
            consensus[k] = statistics.median(vals)
        except statistics.StatisticsError:
            consensus[k] = vals[0] if vals else None
    return initial, consensus


def detect_outliers(pairs):
    """pairs: list of (agent, value). Return set of agent names that deviate
    >8% from the median (and the spread is non-trivial)."""
    vals = [v for _, v in pairs if v is not None]
    if len(vals) < 3:
        return set()
    med = statistics.median(vals)
    if med == 0:
        return set()
    out = set()
    for a, v in pairs:
        if v is None:
            continue
        if abs(v - med) / abs(med) > 0.08:
            out.add(a)
    return out


def build_scenario(d):
    sid = d["scenario_id"]
    short = sid.split("_")[0]
    # agents / seating
    agents = []
    for i, p in enumerate(d["participants"]):
        st = p["stakeholder_type"]
        tagline = first_sentences(p.get("professional_persona", ""), 70)
        agents.append({
            "name": p["name"],
            "type": st,
            "type_ko": STAKEHOLDER_KO.get(st, st),
            "color": STAKEHOLDER_COLOR.get(st, "#64748b"),
            "tagline": tagline,
            "seat": i,
        })
    name_to_agent = {a["name"]: a for a in agents}

    # cross-check lookup: (phase, variable) -> record
    cc = {}
    for c in d.get("cross_checks", []):
        cc[(c["phase"], c["variable"])] = c

    phases = []
    for fp in d["forward_pass"]:
        phase = fp["phase"]
        initial, consensus = collect_phase(fp)
        pmeta = PHASE_META.get(phase, (phase, phase, ""))

        # per-variable convergence + reconciliation
        variables = []
        for var, pairs in initial.items():
            meta = VAR_META.get(var, (var, "", "count"))
            outliers = detect_outliers(pairs)
            ccrec = cc.get((phase, var))
            vals = [v for _, v in pairs]
            spread = (max(vals) - min(vals)) if vals else 0
            variables.append({
                "key": var,
                "label": meta[0],
                "unit": meta[1],
                "fmt": meta[2],
                "initial": [{"agent": a, "value": v, "outlier": a in outliers} for a, v in pairs],
                "spread": spread,
                "consensus": consensus.get(var),
                "backward_agg": ccrec["backward_agg"] if ccrec else None,
                "forward_agg": ccrec["forward_agg"] if ccrec else None,
                "consistency": ccrec["consistency"] if ccrec else None,
                "gap": ccrec["gap"] if ccrec else None,
                "reconciled": ccrec.get("aggregated_value") if ccrec else None,
            })
        # sort: most-contested variable first (largest backward/forward disagreement)
        variables.sort(key=lambda v: (v["consistency"] if v["consistency"] is not None else 1))

        # per-agent posts (initial forward) for speech bubbles
        agent_posts = []
        for p in fp.get("initial_posts") or []:
            a = name_to_agent.get(p["persona_name"])
            if not a:
                continue
            pv = p.get("prediction_values") or {}
            # is this agent an outlier on any variable?
            is_out = any(p["persona_name"] in detect_outliers(initial.get(k, [])) for k in pv)
            agent_posts.append({
                "agent": p["persona_name"],
                "type": p["stakeholder_type"],
                "values": pv,
                "rationale": first_sentences(p.get("narrative", ""), 220),
                "outlier": is_out,
            })

        # backward agent posts (bottom-up re-derivation) — brief
        bw = next((b for b in d["backward_pass"] if b["phase"] == phase), None)
        backward_posts = []
        if bw:
            for p in bw.get("initial_posts") or []:
                backward_posts.append({
                    "agent": p["persona_name"],
                    "values": p.get("prediction_values") or {},
                    "rationale": first_sentences(p.get("narrative", ""), 180),
                })

        # consistency headline
        cons_vals = [v["consistency"] for v in variables if v["consistency"] is not None]
        avg_cons = round(sum(cons_vals) / len(cons_vals), 3) if cons_vals else 1.0
        contested = [v for v in variables if v["consistency"] is not None and v["consistency"] < 0.95]

        phases.append({
            "phase": phase,
            "label_ko": pmeta[0],
            "label_en": pmeta[1],
            "desc": pmeta[2],
            "summary": fp.get("phase_summary", ""),
            "variables": variables,
            "agent_posts": agent_posts,
            "backward_posts": backward_posts,
            "avg_consistency": avg_cons,
            "contested_count": len(contested),
            "posting_order": fp.get("posting_order", []),
        })

    return {
        "id": short,
        "scenario_id": sid,
        "agents": agents,
        "final_impact": d.get("scenario_impact", {}),
        "final_confidence": d.get("scenario_confidence", {}),
        "phases": phases,
    }


def main():
    scenarios = []
    for i in range(1, 6):
        path = os.path.join(RAW, f"scenario_{i}.json")
        if not os.path.exists(path):
            continue
        d = json.load(open(path, encoding="utf-8"))
        scenarios.append(build_scenario(d))
    out = {
        "policy": "Sejong Science Fellowship (세종과학펠로우십)",
        "pass_type": "forward → backward",
        "var_meta": {k: {"label": v[0], "unit": v[1], "fmt": v[2]} for k, v in VAR_META.items()},
        "scenarios": scenarios,
    }
    outpath = os.path.join(HERE, "data", "simulation.json")
    json.dump(out, open(outpath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", outpath, "scenarios:", len(scenarios))


if __name__ == "__main__":
    main()
