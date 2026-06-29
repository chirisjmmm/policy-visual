#!/usr/bin/env python3
"""Generate BK21 multi-agent simulation scenario files in the SAME schema as the
SSF scenario_*.json logs, so the existing build pipeline and UI handle them
without changes.

There was no BK21 simulation log in the repo (all scenario_*.json are SSF), so
these are representative scenarios whose figures are grounded in the real BK21
2022 operation plan (budget 408,080백만원, 577 education research groups, the
official outcome indicators 취업률·전공일치율·전임교수 강의비율, etc.). The
forward/backward spreads and consensus are illustrative; drop in a real BK21 log
with the same shape to replace them.

Output: raw_data/bk21_scenario_1.json, raw_data/bk21_scenario_2.json
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(os.path.dirname(HERE), "raw_data")

PHASE_ORDER = ["Inputs", "Activities", "Outputs", "Outcomes", "Impact"]


def make_scenario(scn_id, agents, personas, phases):
    """agents: list of (name, stakeholder_type). phases: dict phase -> {var: {cons, init?, back?}}."""
    type_of = {n: t for n, t in agents}
    names = [n for n, _ in agents]

    forward_pass, backward_pass, cross = [], [], []
    for pname in PHASE_ORDER:
        vars_ = phases[pname]
        # forward: initial (with spread) + refined (consensus)
        init_posts, refined = [], []
        for n in names:
            pv_i, pv_c = {}, {}
            for vk, vd in vars_.items():
                pv_i[vk] = vd.get("init", {}).get(n, vd["cons"])
                pv_c[vk] = vd["cons"]
            base = {"stakeholder_type": type_of[n], "narrative": "", "evidence": [], "judgment": None}
            init_posts.append({"persona_name": n, "prediction_values": pv_i, **base})
            refined.append({"persona_name": n, "prediction_values": pv_c, **base})
        forward_pass.append({
            "phase": pname, "direction": "forward",
            "initial_posts": init_posts, "revised_posts": [], "refined_posts": refined,
            "phase_summary": "", "posting_order": names,
        })
        # backward: bottom-up aggregate
        bposts = []
        for n in names:
            pv = {vk: vd.get("back", vd["cons"]) for vk, vd in vars_.items()}
            bposts.append({"persona_name": n, "prediction_values": pv,
                           "stakeholder_type": type_of[n], "narrative": "", "evidence": [], "judgment": None})
        backward_pass.append({
            "phase": pname, "direction": "backward",
            "initial_posts": bposts, "refined_posts": [], "phase_summary": "", "posting_order": names,
        })
        # cross-checks (consistency = min/max, matching the SSF logs)
        for vk, vd in vars_.items():
            f = float(vd["cons"]); b = float(vd.get("back", vd["cons"]))
            gap = b - f
            cons_ = (min(f, b) / max(f, b)) if max(f, b) != 0 else 1.0
            cross.append({"phase": pname, "variable": vk, "forward_agg": f, "backward_agg": b,
                          "gap": gap, "relative_gap": (gap / f if f else 0.0),
                          "consistency": cons_, "aggregated_value": f})

    impact_vars = phases["Impact"]
    scenario_impact = {vk: float(vd["cons"]) for vk, vd in impact_vars.items()}
    scenario_confidence = {vk: 1.0 for vk in impact_vars}

    participants = [{
        "stakeholder_type": t, "name": n, "institution": "", "role": "", "background": "",
        "entity_name": f"{t} | BK21", "professional_persona": personas[n],
        "skills_and_expertise": "", "career_goals_and_ambitions": "",
        "sex": "", "age": 0, "marital_status": "", "military_status": "",
    } for n, t in agents]

    return {
        "scenario_id": scn_id, "participants": participants,
        "forward_pass": forward_pass, "backward_pass": backward_pass, "cross_checks": cross,
        "scenario_impact": scenario_impact, "scenario_confidence": scenario_confidence,
        "fwd_bwd_fwd_pass": [], "fwd_bwd_fwd_bwd_pass": [],
    }


# ---------------- Scenario 1 ----------------
agents1 = [
    ("한지윤", "GraduateStudent"),
    ("오세훈", "EducationResearchGroup"),
    ("정민서", "UniversityAdministration"),
    ("배수진", "NationalResearchFoundation"),
    ("강태웅", "ProjectOversightCommittee"),
]
personas1 = {
    "한지윤": "한지윤 씨는 지방 국립대 물리학과 박사과정생으로, 실험 장비 부족 속에서도 꾸준히 논문을 쓰며 안정적인 연구장학금 지원에 가장 민감하게 반응합니다.",
    "오세훈": "오세훈 씨는 수도권 사립대 공학 교육연구단을 이끄는 단장으로, 사업비 자율 집행과 행정 부담 사이에서 균형을 고민하며 성과 목표를 다소 높게 잡는 편입니다.",
    "정민서": "정민서 씨는 대학 본부 산학협력단의 행정 책임자로, 대학원혁신지원비의 회계 투명성과 연차평가 대응을 총괄하며 수치를 보수적으로 잡습니다.",
    "배수진": "배수진 씨는 한국연구재단의 평가 담당으로, 지표의 정의와 데이터 정합성을 깐깐하게 따지며 낙관적 추정을 경계해 값을 낮게 보는 경향이 있습니다.",
    "강태웅": "강태웅 씨는 사업총괄위원회 위원으로 예산과 성과의 균형을 거시적으로 판단하며, 정책 명시값을 기준으로 삼습니다.",
}
phases1 = {
    "Inputs": {
        "total_annual_budget_krw": {"cons": 408080000000},
        "number_of_research_groups": {"cons": 577},
        "graduate_innovation_universities": {"cons": 20},
    },
    "Activities": {
        "self_evaluation_reports": {"cons": 575, "init": {"오세훈": 578, "강태웅": 578}},
        "consulting_groups": {"cons": 280, "init": {"오세훈": 300, "배수진": 260}, "back": 240},
        "commendation_recipients": {"cons": 32},
    },
    "Outputs": {
        "supported_grad_students": {"cons": 19000, "init": {"오세훈": 20500, "배수진": 17500}, "back": 17500},
        "new_researchers_supported": {"cons": 2400, "init": {"오세훈": 2700}},
        "contract_terminations": {"cons": 1},
    },
    "Outcomes": {
        "employment_rate_pct": {"cons": 73, "init": {"오세훈": 82, "배수진": 66}, "back": 68},
        "major_match_rate_pct": {"cons": 88.3, "back": 86},
        "faculty_lecture_ratio_pct": {"cons": 90.4},
    },
    "Impact": {
        "faculty_appointments": {"cons": 1200, "init": {"오세훈": 1550, "배수진": 1000}},
        "annual_sci_e_publications": {"cons": 22000, "init": {"오세훈": 25000}},
        "doctoral_graduates": {"cons": 4800},
    },
}

# ---------------- Scenario 2 ----------------
agents2 = [
    ("김도현", "GraduateStudent"),
    ("나윤서", "EducationResearchGroup"),
    ("서지호", "UniversityAdministration"),
    ("임채원", "EarlyCareerResearcher"),
    ("한석규", "MinistryOfEducation"),
]
personas2 = {
    "김도현": "김도현 씨는 수도권 대학 인문사회 분야 석사과정생으로, 연구장학금과 진로 불안 사이에서 현실적인 취업 성과에 관심이 많습니다.",
    "나윤서": "나윤서 씨는 신산업(바이오헬스) 혁신인재 교육연구단의 신임 단장으로, 산학협력 성과를 적극적으로 기대해 수치를 높게 잡는 편입니다.",
    "서지호": "서지호 씨는 지역 거점 국립대 대학원 혁신 담당 보직교수로, 지역 형평과 안정적 운영을 중시하며 보수적으로 추정합니다.",
    "임채원": "임채원 씨는 박사후연구원(신진연구인력)으로, 인건비와 고용 안정성에 민감하며 현장의 어려움을 반영해 다소 낮게 봅니다.",
    "한석규": "한석규 씨는 교육부 사업 담당 사무관으로, 예산과 정책 목표치를 기준으로 균형 잡힌 추정을 제시합니다.",
}
phases2 = {
    "Inputs": {
        "total_annual_budget_krw": {"cons": 408080000000},
        "number_of_research_groups": {"cons": 577},
        "graduate_innovation_universities": {"cons": 20},
    },
    "Activities": {
        "self_evaluation_reports": {"cons": 575},
        "consulting_groups": {"cons": 280, "init": {"나윤서": 310, "임채원": 255}, "back": 250},
        "commendation_recipients": {"cons": 32, "init": {"나윤서": 40}},
    },
    "Outputs": {
        "supported_grad_students": {"cons": 19000, "init": {"나윤서": 21000, "서지호": 18000}, "back": 18000},
        "new_researchers_supported": {"cons": 2400, "init": {"나윤서": 2800, "임채원": 2100}},
        "contract_terminations": {"cons": 1},
    },
    "Outcomes": {
        "employment_rate_pct": {"cons": 74, "init": {"나윤서": 84, "임채원": 67}, "back": 70},
        "major_match_rate_pct": {"cons": 88.3, "init": {"나윤서": 92}, "back": 87},
        "faculty_lecture_ratio_pct": {"cons": 90.4},
    },
    "Impact": {
        "faculty_appointments": {"cons": 1100, "init": {"나윤서": 1450, "임채원": 950}},
        "annual_sci_e_publications": {"cons": 23000, "init": {"나윤서": 26500}},
        "doctoral_graduates": {"cons": 4900},
    },
}


def main():
    s1 = make_scenario("BK21_S1_한지윤_오세훈_정민서_배수진_강태웅", agents1, personas1, phases1)
    s2 = make_scenario("BK21_S2_김도현_나윤서_서지호_임채원_한석규", agents2, personas2, phases2)
    for fn, sc in [("bk21_scenario_1.json", s1), ("bk21_scenario_2.json", s2)]:
        path = os.path.join(RAW, fn)
        json.dump(sc, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("wrote", path)


if __name__ == "__main__":
    main()
