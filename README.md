# 정책 효과 예측 시각화 (policy-visual)

BK21·세종과학펠로우십 정책 문서를 입력으로, LLM·멀티에이전트가 단계별 토의
(forward→backward)를 거쳐 정책 효과를 예측하는 연구의 결과를 웹에서 보여주는
정적(static) 시각화입니다.

## 폴더 구조

```
policy-visual/
├─ index.html          ← 루트 진입점 (web/index.html 로 자동 이동, Live Server용)
├─ raw_data/           ← 원본 입력 데이터
│   ├─ bk21_2022_plan.md
│   ├─ sejong-science-fellowship.md
│   ├─ kr_bk21_policy_graph.json   (러프한 원본 KG)
│   ├─ kr_ssf_policy_graph.json    (러프한 원본 KG)
│   └─ scenario_1~5.json           (멀티에이전트 시뮬레이션 로그)
├─ web/                ← 시각화 웹앱 (HTML/CSS/JS, 외부 라이브러리 없음)
│   ├─ index.html
│   ├─ css/styles.css
│   ├─ js/             (graph.js · simulation.js · feedback.js · main.js)
│   ├─ data/           (앱이 읽는 가공 데이터: graph/simulation/feedback.json)
│   └─ build_simulation.py   (raw_data → web/data/simulation.json 생성)
└─ .vscode/settings.json  ← Live Server 설정
```

## 실행 방법

### 방법 1 — VS Code Live Server (권장)
1. VS Code에서 이 폴더를 엽니다.
2. **Live Server** 확장(`ritwickdey.LiveServer`)을 설치합니다.
3. 우측 하단 상태바의 **`Go Live`** 버튼을 클릭합니다.
   - 루트 `index.html`이 자동으로 `web/index.html`로 이동합니다.
   - 또는 `web/index.html`을 연 뒤 우클릭 → **Open with Live Server**.

### 방법 2 — 파이썬 내장 서버
```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

> `file://`로 직접 열면 `fetch()`가 막혀 데이터가 안 보입니다. 반드시 위 둘 중
> 하나로 **로컬 서버**를 통해 여세요.

## 3개 탭

1. **이해관계 구조** — 원본 KG를 그대로 쓰지 않고 정책 문서 기준으로 재구성한
   그래프(BK21·SSF). 관계 종류별 색 구분, BK21 미래인재/혁신인재 트랙 구분.
2. **시뮬레이션 (원탁 토의)** — 다섯 이해관계자가 단계별로 결론·근거를 제시하는
   forward→backward 과정. 이상치 흡수·합의 도달, 교차검증 불일치 지점 시각화.
3. **전문가 피드백** — 국가연구개발 성과평가·정책 고유 지표·OECD-DAC 기준 위에
   전문가 유형별 피드백을 배치.

## 데이터 재생성

시뮬레이션 가공 데이터를 다시 만들려면:
```bash
python3 web/build_simulation.py   # raw_data/scenario_*.json → web/data/simulation.json
```
