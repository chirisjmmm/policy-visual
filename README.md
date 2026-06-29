# 정책 효과 예측 시각화 (policy-visual)

BK21·세종과학펠로우십 정책 문서를 입력으로, LLM·멀티에이전트가 단계별 토의
(forward→backward)를 거쳐 정책 효과를 예측하는 연구의 결과를 웹에서 보여주는
정적(static) 시각화입니다.

## 폴더 구조

```
policy-visual/
├─ raw_data/           ← 원본 입력 데이터
│   ├─ bk21_2022_plan.md
│   ├─ sejong-science-fellowship.md
│   ├─ kr_bk21_policy_graph.json   (러프한 원본 KG)
│   ├─ kr_ssf_policy_graph.json    (러프한 원본 KG)
│   └─ scenario_1~5.json           (멀티에이전트 시뮬레이션 로그)
├─ web/                ← 시각화 웹앱 (HTML/CSS/JS, 외부 라이브러리 없음)
│   ├─ index.html      ← 진입점 (이 파일을 Go Live)
│   ├─ css/styles.css
│   ├─ js/             (graph.js · simulation.js · feedback.js · main.js)
│   ├─ data/           (앱이 읽는 가공 데이터: graph/simulation/feedback.json)
│   └─ build_simulation.py   (raw_data → web/data/simulation.json 생성)
└─ .vscode/settings.json  ← Live Server 루트를 web/ 으로 지정
```

## 실행 방법

### 방법 1 — VS Code Live Server (권장)
1. VS Code에서 이 폴더를 엽니다.
2. **Live Server** 확장(`ritwickdey.LiveServer`)을 설치합니다.
3. `web/index.html`을 열고 우클릭 → **Open with Live Server**.
   - 또는 상태바의 **`Go Live`** 버튼 클릭. `.vscode/settings.json`이 서버 루트를
     `web/` 으로 지정해 두어 바로 앱이 열립니다.

### 방법 2 — 파이썬 내장 서버
```bash
cd web
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

> `file://`로 직접 열면 `fetch()`가 막혀 데이터가 안 보입니다. 반드시 위 둘 중
> 하나로 **로컬 서버**를 통해 여세요.

## 3개 탭

1. **이해관계 구조** — 행위자(기관·인재)만 노드로 둔 그래프(BK21·SSF). 노드를
   클릭하면 행위자 설명과 수행·수혜 항목이 열리고, 마우스를 올리면 연결된 행위자만
   강조됩니다. 관계 종류별 색 구분, BK21 미래인재/혁신인재 트랙 구분, 그래프 아래
   정책 개요 제공.
2. **시뮬레이션 (원탁 토의)** — forward 전 과정을 마친 뒤 backward 전 과정을 진행하는
   흐름을 U자(⤾) 흐름도로 표시. 이상치 흡수·합의 도달을 보여주고, ‘이견’ 표시된 결과
   박스를 누르면 다른 값을 낸 참여자의 배경·근거가 나타납니다.
3. **전문가 피드백** — 국가연구개발 성과평가 체계·정책 고유 성과지표의 세부 지표
   아래에 점검 항목(체크리스트)을 배치. 각 항목은 측면(지표 정확성·실행 병목·결과
   분배·한계·측정 가능성)과 대상(구조/시뮬레이션)으로 구조화.

## 데이터 재생성

시뮬레이션 가공 데이터를 다시 만들려면:
```bash
python3 web/build_simulation.py   # raw_data/scenario_*.json → web/data/simulation.json
```
