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
    # --- BK21 ---
    "number_of_research_groups":    ("교육연구단 수", "개", "count"),
    "graduate_innovation_universities": ("대학원혁신지원대학", "개", "count"),
    "self_evaluation_reports":      ("자체평가 제출", "개", "count"),
    "consulting_groups":            ("성과 컨설팅 단", "개", "count"),
    "commendation_recipients":      ("우수 참여인력 표창", "명", "count"),
    "supported_grad_students":      ("지원 대학원생", "명", "count"),
    "new_researchers_supported":    ("신진연구인력 지원", "명", "count"),
    "contract_terminations":        ("협약해지 교육연구단", "개", "count"),
    "employment_rate_pct":          ("대학원생 취업률", "%", "pct"),
    "major_match_rate_pct":         ("취업 전공일치율", "%", "pct"),
    "faculty_lecture_ratio_pct":    ("전임교수 강의비율", "%", "pct"),
    "faculty_appointments":         ("전임교원 임용", "명", "count"),
    "annual_sci_e_publications":    ("연간 SCI(E) 논문", "편", "count"),
    "doctoral_graduates":           ("박사 배출", "명", "count"),
}

PHASE_META = {
    "Inputs":     ("투입", "Inputs", "정책에 투입되는 예산·정원·제도적 조건"),
    "Activities": ("활동", "Activities", "선발·평가 등 정책이 수행하는 활동"),
    "Outputs":    ("산출", "Outputs", "활동의 직접적 산출물"),
    "Outcomes":   ("성과", "Outcomes", "수혜자에게 나타나는 중기 성과"),
    "Impact":     ("영향", "Impact", "사회·학계에 미치는 장기 영향"),
}

STAKEHOLDER_KO = {
    # SSF
    "EvaluationPanel": "평가위원",
    "PolicyRole": "정책담당자",
    "PostdoctoralResearcher": "박사후연구원",
    # BK21
    "GraduateStudent": "대학원생",
    "EducationResearchGroup": "교육연구단",
    "UniversityAdministration": "대학 본부",
    "NationalResearchFoundation": "연구재단",
    "ProjectOversightCommittee": "사업총괄위원",
    "MinistryOfEducation": "교육부",
    "EarlyCareerResearcher": "신진연구인력",
}
STAKEHOLDER_COLOR = {
    "EvaluationPanel": "#6366f1",        # indigo
    "PolicyRole": "#0ea5e9",             # sky
    "PostdoctoralResearcher": "#f59e0b", # amber
    "GraduateStudent": "#c2255c",        # rose
    "EducationResearchGroup": "#1864ab", # blue
    "UniversityAdministration": "#5c6b8a", # slate
    "NationalResearchFoundation": "#0c8599", # teal
    "ProjectOversightCommittee": "#6741d9",  # violet
    "MinistryOfEducation": "#7048e8",    # purple
    "EarlyCareerResearcher": "#e8590c",  # orange
}


def fmt_ko(v, fmt, unit):
    """Human-readable Korean number formatting."""
    if v is None:
        return "—"
    if fmt == "budget":
        x = v / 1e8
        s = f"{x:.1f}".rstrip("0").rstrip(".")
        return f"{s}억원"
    if fmt == "pct":
        x = round(v, 2)
        if x == int(x):
            x = int(x)
        return f"{x}{unit}"
    return f"{int(round(v)):,}{unit}"


def persona_short(text, max_len=95):
    """First sentence of the (Korean) professional persona, trimmed."""
    if not text:
        return ""
    text = text.strip().replace("\n", " ")
    # cut at first Korean sentence end
    for end in ("다. ", "요. ", "함. "):
        idx = text.find(end)
        if 0 < idx < max_len + 30:
            return text[: idx + 2].strip()
    if len(text) <= max_len:
        return text
    return text[:max_len].rstrip() + "…"


def variable_dissent(var, agents_meta):
    """Outlier agents on this variable, with direction and persona, for the
    clickable 'why did they differ' detail."""
    cons = var.get("consensus")
    out = []
    for o in var["initial"]:
        if not o["outlier"]:
            continue
        a = agents_meta.get(o["agent"], {})
        if cons is not None and o["value"] is not None:
            direction = "다수보다 높게" if o["value"] > cons else "다수보다 낮게"
        else:
            direction = "다른 값으로"
        out.append({
            "agent": o["agent"],
            "type_ko": a.get("type_ko", ""),
            "value": fmt_ko(o["value"], var["fmt"], var["unit"]),
            "direction": direction,
            "persona": a.get("persona", ""),
        })
    return out


def phase_summary_ko(variables, agents_meta):
    """A detailed, factual Korean summary of the phase discussion + reconciliation."""
    if not variables:
        return ""
    fmv = lambda v, m: fmt_ko(v, m["fmt"], m["unit"])
    parts = []
    agreed, spread = [], []
    for v in variables:
        vals = [x["value"] for x in v["initial"] if x["value"] is not None]
        (agreed if vals and min(vals) == max(vals) else spread).append(v)
    if agreed:
        names = " · ".join(dict.fromkeys(v["label"] for v in agreed))
        parts.append(f"{names}은(는) 정책에 명시된 값으로 다섯 참여자의 이견이 없었습니다.")
    seen_label = set()
    for v in spread:
        if v["label"] in seen_label:
            continue
        seen_label.add(v["label"])
        pairs = [(x["agent"], x["value"]) for x in v["initial"] if x["value"] is not None]
        hi = max(pairs, key=lambda t: t[1]); lo = min(pairs, key=lambda t: t[1])
        outs = [x["agent"] for x in v["initial"] if x["outlier"]]
        s = (f"‘{v['label']}’은(는) {lo[0]}이 {fmv(lo[1], v)}로 가장 낮게, "
             f"{hi[0]}이 {fmv(hi[1], v)}로 가장 높게 보아 갈렸지만, "
             f"토의 끝에 {fmv(v['consensus'], v)}로 수렴했습니다.")
        if outs:
            s += f" 이 과정에서 {', '.join(outs)}의 이견(이상치)이 흡수되었습니다."
        parts.append(s)
    contested = [v for v in variables
                 if v["consistency"] is not None and v["consistency"] < 0.95]
    if contested:
        cs = [f"{v['label']}(forward {fmv(v['forward_agg'], v)} ↔ backward {fmv(v['backward_agg'], v)}, "
              f"합의도 {round(v['consistency'] * 100)}%)" for v in contested]
        parts.append("forward와 backward(상향식) 추정을 대조하면 " + ", ".join(cs)
                     + "에서 차이가 남아, 이 단계의 핵심 불확실성을 보여줍니다.")
    else:
        parts.append("forward와 backward 추정이 거의 일치해 이 단계의 결론은 견고합니다.")
    return " ".join(parts)


def rationale_ko(type_ko, values, variables, is_outlier):
    """Concise Korean summary of one agent's stance for the phase, from values."""
    seen, chunks = set(), []
    for v in variables:
        k = v["key"]
        if k in values and values[k] is not None and v["label"] not in seen:
            seen.add(v["label"])
            chunks.append(f"{v['label']} {fmt_ko(values[k], v['fmt'], v['unit'])}")
    line = " · ".join(chunks) if chunks else "예측값 없음"
    note = " — 다수와 다른 추정(이상치)" if is_outlier else ""
    return f"{type_ko}의 예측: {line}{note}"


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


def build_scenario(d, policy="ssf"):
    sid = d["scenario_id"]
    parts = sid.split("_")
    short = parts[1] if (parts[0].upper() == "BK21" and len(parts) > 1) else parts[0]
    # agents / seating
    agents = []
    for i, p in enumerate(d["participants"]):
        st = p["stakeholder_type"]
        agents.append({
            "name": p["name"],
            "type": st,
            "type_ko": STAKEHOLDER_KO.get(st, st),
            "color": STAKEHOLDER_COLOR.get(st, "#64748b"),
            "persona": persona_short(p.get("professional_persona", "")),
            "seat": i,
        })
    name_to_agent = {a["name"]: a for a in agents}
    agents_meta = {a["name"]: a for a in agents}

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
        for v in variables:
            v["dissent"] = variable_dissent(v, agents_meta)

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
                "rationale_ko": rationale_ko(
                    STAKEHOLDER_KO.get(p["stakeholder_type"], p["stakeholder_type"]),
                    pv, variables, is_out),
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
            "summary_ko": phase_summary_ko(variables, agents_meta),
            "variables": variables,
            "agent_posts": agent_posts,
            "backward_posts": backward_posts,
            "avg_consistency": avg_cons,
            "contested_count": len(contested),
            "posting_order": fp.get("posting_order", []),
        })

    return {
        "id": short,
        "policy": policy,
        "scenario_id": sid,
        "agents": agents,
        "final_impact": d.get("scenario_impact", {}),
        "final_confidence": d.get("scenario_confidence", {}),
        "phases": phases,
    }


def load_glob(pattern, policy):
    import glob
    out = []
    for path in sorted(glob.glob(os.path.join(RAW, pattern))):
        d = json.load(open(path, encoding="utf-8"))
        out.append(build_scenario(d, policy))
    return out


def main():
    scenarios = []
    scenarios += load_glob("scenario_*.json", "ssf")
    scenarios += load_glob("bk21_scenario_*.json", "bk21")
    out = {
        "policies": {
            "ssf": "세종과학펠로우십 (SSF)",
            "bk21": "두뇌한국21 (BK21)",
        },
        "pass_type": "forward → backward",
        "var_meta": {k: {"label": v[0], "unit": v[1], "fmt": v[2]} for k, v in VAR_META.items()},
        "scenarios": scenarios,
    }
    outpath = os.path.join(HERE, "data", "simulation.json")
    json.dump(out, open(outpath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", outpath, "scenarios:", len(scenarios),
          "(ssf:", sum(1 for s in scenarios if s['policy'] == 'ssf'),
          "bk21:", sum(1 for s in scenarios if s['policy'] == 'bk21'), ")")


if __name__ == "__main__":
    main()
