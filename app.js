const { useState, useEffect, useCallback, useRef } = React;

// ---------- Color por tono (pinyin) ----------
// Asocia cada tono del mandarín a un color fijo — técnica mnemónica estándar
// para memorizar tonos (verificados: 4.5:1+ de contraste en fondos claros
// y oscuros reales de la app; ver auditoría de diseño).
// Cada carácter con tilde de tono mapea a [letra base, número de tono], para
// poder reconstruir tanto el tono como la forma "plana" de la palabra.
const TONE_VOWELS = {
  "ā":["a",1],"ē":["e",1],"ī":["i",1],"ō":["o",1],"ū":["u",1],"ǖ":["ü",1],
  "Ā":["a",1],"Ē":["e",1],"Ī":["i",1],"Ō":["o",1],"Ū":["u",1],"Ǖ":["ü",1],
  "á":["a",2],"é":["e",2],"í":["i",2],"ó":["o",2],"ú":["u",2],"ǘ":["ü",2],
  "Á":["a",2],"É":["e",2],"Í":["i",2],"Ó":["o",2],"Ú":["u",2],"Ǘ":["ü",2],
  "ǎ":["a",3],"ě":["e",3],"ǐ":["i",3],"ǒ":["o",3],"ǔ":["u",3],"ǚ":["ü",3],
  "Ǎ":["a",3],"Ě":["e",3],"Ǐ":["i",3],"Ǒ":["o",3],"Ǔ":["u",3],"Ǚ":["ü",3],
  "à":["a",4],"è":["e",4],"ì":["i",4],"ò":["o",4],"ù":["u",4],"ǜ":["ü",4],
  "À":["a",4],"È":["e",4],"Ì":["i",4],"Ò":["o",4],"Ù":["u",4],"Ǜ":["ü",4],
};
const TONE_COLORS_LIGHT = { 1: "#B23A2E", 2: "#8A5A00", 3: "#256B29", 4: "#1257A6", 0: "#5F5F5F" };
const TONE_COLORS_DARK  = { 1: "#FF8A80", 2: "#FFB74D", 3: "#81C784", 4: "#82C4FF", 0: "#BDBDBD" };

// Iniciales y finales válidas del pinyin, para partir una palabra pegada
// (ej. "wǒmen") en sus sílabas reales — de lo contrario toda la palabra se
// pinta de un solo color según la primera tilde que aparezca.
const PINYIN_INITIALS = ["zh","ch","sh","b","p","m","f","d","t","n","l","g","k","h","j","q","x","r","z","c","s","y","w"];
const PINYIN_FINALS = [...new Set([
  "iang","iong","uang","ueng",
  "ang","eng","ong","ai","ei","ao","ou","an","en","er",
  "ia","ie","iu","iao","ian","in","ing",
  "ua","uo","ui","uai","uan","un",
  "ue","üe","üan","ün",
  "a","o","e","i","u","ü",
])].sort((a, b) => b.length - a.length);

// Divide una palabra pinyin (con tildes) en sus sílabas reales con su tono,
// usando coincidencia de máxima longitud contra iniciales/finales válidas.
function pinyinSyllables(word) {
  let flat = "";
  const toneAt = {};
  for (const ch of word) {
    const mapped = TONE_VOWELS[ch];
    if (mapped) { toneAt[flat.length] = mapped[1]; flat += mapped[0]; }
    else flat += ch.toLowerCase();
  }
  const bounds = [];
  let i = 0;
  while (i < flat.length) {
    const initial = PINYIN_INITIALS.find(ini => flat.startsWith(ini, i)) || "";
    const afterInitial = i + initial.length;
    const final = PINYIN_FINALS.find(fin => flat.startsWith(fin, afterInitial));
    const end = final ? afterInitial + final.length : i + 1; // sin final válida: no se traba, avanza 1
    bounds.push([i, end]);
    i = end;
  }
  return bounds.map(([start, end]) => {
    let tone = 0;
    for (let k = start; k < end; k++) if (toneAt[k]) tone = toneAt[k];
    return { text: word.slice(start, end), tone };
  });
}

// Colorea cada sílaba pinyin según su tono; deja espacios/puntuación sin colorear.
function renderPinyinTone(text, dark) {
  if (!text) return null;
  const palette = dark ? TONE_COLORS_DARK : TONE_COLORS_LIGHT;
  const parts = text.split(/([\p{L}]+)/u);
  return parts.map((part, i) => {
    if (!part) return null;
    if (!/\p{L}/u.test(part)) return part;
    return (
      <React.Fragment key={i}>
        {pinyinSyllables(part).map((syl, j) => (
          <span key={j} style={{ color: palette[syl.tone] }}>{syl.text}</span>
        ))}
      </React.Fragment>
    );
  });
}

function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const voiceRef = useRef(null);

  useEffect(() => {
    const load = () => {
      const voices = window.speechSynthesis.getVoices();
      const zh = voices.find(v => v.lang.startsWith("zh")) || 
                 voices.find(v => v.lang.includes("CN")) ||
                 voices.find(v => v.lang.includes("TW"));
      voiceRef.current = zh || null;
      setVoiceReady(true);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const speak = useCallback((text) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "zh-CN";
    utt.rate = 0.85;
    utt.pitch = 1;
    if (voiceRef.current) utt.voice = voiceRef.current;
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, []);

  return { speak, speaking, voiceReady };
}


function FrontPinyinReveal({ pinyin, cardId }) {
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [cardId]);
  return !shown ? (
    <button onClick={e => { e.stopPropagation(); setShown(true); }} style={{
      background: "rgba(255,255,255,0.07)", border: "1px dashed rgba(255,157,61,0.5)",
      borderRadius: 20, padding: "7px 18px", color: "#FF9D3D",
      fontSize: 13, cursor: "pointer"
    }}>
      拼 Ver pinyin
    </button>
  ) : (
    <div style={{ fontSize: 16, fontStyle: "italic", color: TONE_COLORS_DARK[0] }}>{renderPinyinTone(pinyin, true)}</div>
  );
}

function ExampleBox({ card, color, speak, speaking }) {
  const [showPy, setShowPy] = useState(false);
  const [showEs, setShowEs] = useState(false);
  return (
    <div onClick={e => e.stopPropagation()} style={{
      marginTop: 10, background: `${color.accent}12`, borderRadius: 14,
      padding: "12px 14px", width: "100%", boxSizing: "border-box"
    }}>
      {/* Chinese + audio */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 15, color: color.accent, fontWeight: "bold", textAlign: "center", lineHeight: 1.5 }}>
          {card.exZh}
        </span>
        <button onClick={() => speak(card.exZh)} style={{
          background: speaking ? `${color.accent}33` : "transparent",
          border: `1px solid ${color.accent}55`, borderRadius: 20,
          padding: "3px 8px", color: color.accent, fontSize: 12, cursor: "pointer", flexShrink: 0
        }}>🔊</button>
      </div>

      {/* Pinyin reveal */}
      {!showPy ? (
        <button onClick={() => setShowPy(true)} style={{
          display: "block", width: "100%", marginBottom: 6,
          background: `${color.accent}10`, border: `1px dashed ${color.accent}55`,
          borderRadius: 10, padding: "6px 0", color: color.accent,
          fontSize: 12, cursor: "pointer"
        }}>
          拼 Ver pinyin
        </button>
      ) : (
        <p style={{ fontSize: 13, textAlign: "center", margin: "0 0 6px 0", fontStyle: "italic", color: TONE_COLORS_LIGHT[0] }}>
          {renderPinyinTone(card.exPy, false)}
        </p>
      )}

      {/* Translation reveal */}
      {!showEs ? (
        <button onClick={() => setShowEs(true)} style={{
          display: "block", width: "100%",
          background: `${color.accent}10`, border: `1px dashed ${color.accent}55`,
          borderRadius: 10, padding: "6px 0", color: color.accent,
          fontSize: 12, cursor: "pointer"
        }}>
          🇲🇽 Ver traducción
        </button>
      ) : (
        <p style={{ fontSize: 13, color: "#444", textAlign: "center", margin: "0", lineHeight: 1.5 }}>
          {card.exEs}
        </p>
      )}
    </div>
  );
}


const RATING = { know: "know", almost: "almost", dontKnow: "dontKnow" };

// ---------- Repetición espaciada + progreso guardado ----------
const STORAGE_KEY = "gwc_srs_progress_v1";
const BOX_INTERVAL_DAYS = [1, 2, 4, 7, 14, 30]; // índice = número de caja
const MAX_BOX = BOX_INTERVAL_DAYS.length - 1;
const DAY_MS = 24 * 60 * 60 * 1000;

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    // localStorage lleno o deshabilitado — falla en silencio, no rompe la app
  }
}

function computeNextEntry(prevEntry, rating) {
  const prevBox = prevEntry ? prevEntry.box : -1;
  let box;
  if (rating === RATING.know) box = Math.min(prevBox + 1, MAX_BOX);
  else if (rating === RATING.almost) box = Math.max(prevBox, 0);
  else box = 0;
  const days = BOX_INTERVAL_DAYS[box];
  return { box, nextReview: Date.now() + days * DAY_MS, lastReviewed: Date.now() };
}

function isDue(cardId, progress) {
  const p = progress[cardId];
  if (!p) return true; // nunca estudiada = pendiente
  return p.nextReview <= Date.now();
}

// ---------- Preferencias guardadas (unidades, dirección, audio, pinyin, nivel) ----------
const PREFS_KEY = "gwc_prefs_v1";
const DEFAULT_PREFS = {
  selectedUnits: [1,2,3,4,5,6,7,8,9,10,13,14,15,16,17,18,19],
  studyDir: "es→zh",
  showPinyin: true,
  autoPlay: true,
  builderLevel: "easy",
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch (e) {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) { /* falla en silencio */ }
}

// ---------- Racha de días seguidos ----------
const STREAK_KEY = "gwc_streak_v1";

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function loadStreak() {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    return raw ? JSON.parse(raw) : { lastDate: null, current: 0, longest: 0 };
  } catch (e) {
    return { lastDate: null, current: 0, longest: 0 };
  }
}

function recordActivity(streak, setStreak) {
  const today = todayStr();
  if (streak.lastDate === today) return; // ya contado hoy
  const yesterday = new Date(Date.now() - DAY_MS);
  const yStr = yesterday.getFullYear() + "-" + (yesterday.getMonth() + 1) + "-" + yesterday.getDate();
  const newCurrent = streak.lastDate === yStr ? streak.current + 1 : 1;
  const updated = { lastDate: today, current: newCurrent, longest: Math.max(newCurrent, streak.longest) };
  localStorage.setItem(STREAK_KEY, JSON.stringify(updated));
  setStreak(updated);
}

// ---------- Modo: Construir frases ----------
function isGoodForBuilder(card) {
  const zh = card.zh;
  if (card.unitName.includes("📐")) return false;
  if (/[\/（(]/.test(zh)) return false;
  if (/[A-Za-z]/.test(zh)) return false;
  if (zh.includes("……") || zh.includes("___")) return false;
  return true;
}

// ---------- Modo: Patrones gramaticales ----------
// Organiza las 📐 tarjetas de gramática por TIPO de patrón, cruzando unidades.
// Si se agregan más tarjetas 📐 en el futuro, hay que sumar sus IDs aquí.
const PATTERN_CATEGORIES = [
  { key: "medidas", icon: "📏", label: "Medidas y cantidades", color: "#FF6B35", ids: [40,41,250,251,181,182,183,254,162,163,314,315,316,317,318,319,320,321,322,323,324,325,326,327,328,329,330,331,332,333,334,335,336,337,338,339,340,341,342,343,344,345,346,347,348,349,350,351,352,353] },
  { key: "posesion", icon: "🔑", label: "的 y posesión", color: "#7B1FA2", ids: [157,158,247,248,252,354,355,356,357,358,359,360,361,362,363,364,365,366,367,368,369,370,371,372,373] },
  { key: "tiempo", icon: "⏰", label: "Tiempo", color: "#00695C", ids: [42,125,126,127,180,374,375,376,377,378,379,380,381,382,383,384,385,386,387,388,389,390,391,392,393] },
  { key: "poder", icon: "🚦", label: "Poder y permiso", color: "#1565C0", ids: [124,164,253,286,394,395,396,397,398,399,400,401,402,403,404,405,406,407,408,409] },
  { key: "ubicacion", icon: "🧭", label: "Ubicación y dirección", color: "#2E7D32", ids: [173,174,175,223,224,225,226,269,270,271,272,222,410,411,412,413,414,415,416,417,418,419,420,421,422,423,424,425,426,427,428,429,430,431,432,433,434,435,436,437,438,439,440,441,442,443,444,445,446,447,448,449,450,451,452,453,454,455,456,457] },
  { key: "preguntas", icon: "❓", label: "Preguntas especiales", color: "#C62828", ids: [170,171,172,176,268,273,166,458,459,460,461,462,463,464,465,466,467,468,469,470,471,472,473,474,475,476,477,478,479,480,481,482,483,484,485] },
  { key: "matices", icon: "🔀", label: "Palabras que se confunden", color: "#AD1457", ids: [184,185,227,228,229,249,285,255,486,487,488,489,490,491,492,493,494,495,496,497,498,499,500,501,502,503,504,505,506,507,508,509,510,511,512,513,514,515,516,517] },
  { key: "estructura", icon: "✍️", label: "Estructura de oración", color: "#558B2F", ids: [165,169,298,299,312,313,518,519,520,521,522,523,524,525,526,527,528,529,530,531,532,533,534,535,536,537,538,539,540,541] },
  { key: "tonos", icon: "🔤", label: "Tonos y radicales", color: "#5E35B1", ids: [159,160,161,130,167,168,177,178,179,230,256,257] },
  { key: "clasificadores", icon: "🔢", label: "量词 · Measure words", color: "#F9A825", ids: [542,543,544,545,546,547,548,549,550,551,552,553,554,555,556,557,558,559,560,561,562,563,564,565,566,567] },
];

function ProgressRing({ pct, size = 84, color = "#FF9D3D" }) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(pct, 100) / 100) * circumference;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={radius} stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} fill="none" />
        <circle cx={size/2} cy={size/2} r={radius} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div style={{
        position: "absolute", top: 0, left: 0, width: size, height: size,
        display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column"
      }}>
        <span style={{ color: "white", fontSize: 20, fontWeight: "bold", fontFamily: "sans-serif" }}>{pct}%</span>
        <span style={{ color: "#999", fontSize: 9, fontFamily: "sans-serif" }}>dominado</span>
      </div>
    </div>
  );
}

function App() {
  const initialPrefs = loadPrefs();
  const [selectedUnits, setSelectedUnits] = useState(initialPrefs.selectedUnits);
  const [mode, setMode] = useState("menu");
  const [deck, setDeck] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showPinyin, setShowPinyin] = useState(initialPrefs.showPinyin);
  const [showExample, setShowExample] = useState(false);
  const [ratings, setRatings] = useState({});
  const [studyDir, setStudyDir] = useState(initialPrefs.studyDir);
  const [animating, setAnimating] = useState(false);
  const [autoPlay, setAutoPlay] = useState(initialPrefs.autoPlay);
  const [progress, setProgress] = useState(() => loadProgress());
  const [streak, setStreak] = useState(() => loadStreak());
  const { speak, speaking, voiceReady } = useSpeech();

  const units = [...new Set(ALL_CARDS.map(c => c.unit))].sort((a,b)=>a-b);

  const dueCards = ALL_CARDS.filter(c => isDue(c.id, progress));
  const dueCount = dueCards.length;
  const newDueCount = dueCards.filter(c => !progress[c.id]).length;
  const reviewDueCount = dueCount - newDueCount;
  const masteredCount = Object.values(progress).filter(p => p.box >= MAX_BOX).length;
  const learningCount = Object.values(progress).filter(p => p.box < MAX_BOX).length;
  const newCount = ALL_CARDS.length - Object.keys(progress).length;
  const masteredPct = Math.round((masteredCount / ALL_CARDS.length) * 100);
  const hasHistory = Object.keys(progress).length > 0;

  const masteryFor = (cards) => {
    if (cards.length === 0) return 0;
    const mastered = cards.filter(c => progress[c.id] && progress[c.id].box >= MAX_BOX).length;
    return Math.round((mastered / cards.length) * 100);
  };
  const unitMastery = (unitNum) => masteryFor(ALL_CARDS.filter(c => c.unit === unitNum));
  const categoryMastery = (cat) => masteryFor(ALL_CARDS.filter(c => cat.ids.includes(c.id)));

  const resetProgress = () => {
    if (window.confirm("¿Seguro que quieres borrar todo tu progreso guardado? Esto no se puede deshacer.")) {
      setProgress({});
      saveProgress({});
    }
  };

  // ---------- Modo: Patrones gramaticales ----------
  const [selectedCategory, setSelectedCategory] = useState(null);

  const openCategory = (cat) => {
    setSelectedCategory(cat);
    setMode("patternDetail");
  };

  const practiceCategory = (cat) => {
    const cards = ALL_CARDS.filter(c => cat.ids.includes(c.id));
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setDeck(shuffled);
    setCurrentIdx(0);
    setFlipped(false);
    setShowExample(false);
    setRatings({});
    setMode("study");
  };

  const startReviewToday = () => {
    const shuffled = [...dueCards].sort(() => Math.random() - 0.5);
    setDeck(shuffled);
    setCurrentIdx(0);
    setFlipped(false);
    setShowExample(false);
    setRatings({});
    setMode("study");
  };

  // ---------- Modo: Construir frases ----------
  const [builderLevel, setBuilderLevel] = useState(initialPrefs.builderLevel); // easy | medium | hard

  // Guarda preferencias automáticamente cuando cambian (va aquí porque necesita builderLevel ya declarado)
  useEffect(() => {
    savePrefs({ selectedUnits, studyDir, showPinyin, autoPlay, builderLevel });
  }, [selectedUnits, studyDir, showPinyin, autoPlay, builderLevel]);
  const [buildDeck, setBuildDeck] = useState([]);
  const [buildIdx, setBuildIdx] = useState(0);
  const [pool, setPool] = useState([]);
  const [answer, setAnswer] = useState([]);
  const [buildResult, setBuildResult] = useState(null);
  const [buildStats, setBuildStats] = useState({ correct: 0, wrong: 0 });
  const [showBuildAnswer, setShowBuildAnswer] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [hardResult, setHardResult] = useState(null);
  const [hardDiff, setHardDiff] = useState([]);

  const buildableCards = ALL_CARDS.filter(c => selectedUnits.includes(c.unit) && isGoodForBuilder(c));
  const buildCard = buildDeck[buildIdx];

  const getDistractorChars = (correctChars, count) => {
    const pool2 = new Set();
    buildableCards.forEach(c => Array.from(c.zh).forEach(ch => {
      if (!/[，。！？、；：""''\?\!]/.test(ch)) pool2.add(ch);
    }));
    correctChars.forEach(ch => pool2.delete(ch));
    const arr = [...pool2];
    const picked = [];
    for (let i = 0; i < count && arr.length > 0; i++) {
      const idx = Math.floor(Math.random() * arr.length);
      picked.push(arr.splice(idx, 1)[0]);
    }
    return picked;
  };

  const shuffleTilesFor = (c) => {
    const correctChars = Array.from(c.zh);
    let tiles = correctChars.map((ch, i) => ({ ch, uid: c.id + "-" + i + "-" + Math.random() }));
    if (builderLevel === "medium") {
      const distractors = getDistractorChars(correctChars, 3);
      tiles = tiles.concat(distractors.map((ch, i) => ({ ch, uid: c.id + "-d" + i + "-" + Math.random() })));
    }
    setPool([...tiles].sort(() => Math.random() - 0.5));
    setAnswer([]);
    setBuildResult(null);
    setShowBuildAnswer(false);
    setTypedAnswer("");
    setHardResult(null);
    setHardDiff([]);
  };

  const startBuild = () => {
    const shuffled = [...buildableCards].sort(() => Math.random() - 0.5);
    setBuildDeck(shuffled);
    setBuildIdx(0);
    setBuildStats({ correct: 0, wrong: 0 });
    shuffleTilesFor(shuffled[0]);
    setMode("build");
  };

  const tapPoolTile = (tile) => {
    setPool(prev => prev.filter(t => t.uid !== tile.uid));
    setAnswer(prev => [...prev, tile]);
  };

  const tapAnswerTile = (tile) => {
    setAnswer(prev => prev.filter(t => t.uid !== tile.uid));
    setPool(prev => [...prev, tile]);
    setBuildResult(null);
  };

  const nextBuildCard = () => {
    if (buildIdx + 1 >= buildDeck.length) {
      setMode("buildResults");
    } else {
      const next = buildIdx + 1;
      setBuildIdx(next);
      shuffleTilesFor(buildDeck[next]);
    }
  };

  const registerResult = (correct) => {
    setBuildStats(prev => ({ ...prev, correct: prev.correct + (correct ? 1 : 0), wrong: prev.wrong + (correct ? 0 : 1) }));
    recordActivity(streak, setStreak);
    if (correct) speak(buildCard.zh);
  };

  // Nivel medio: verificación manual (puede quedar fichas señuelo sin usar)
  const checkMediumAnswer = () => {
    const built = answer.map(t => t.ch).join("");
    const correct = built === buildCard.zh;
    setBuildResult(correct ? "correct" : "wrong");
    registerResult(correct);
  };

  // Nivel difícil (听写 tīngxiě): escribir la frase completa de memoria
  const checkHardAnswer = () => {
    const typed = typedAnswer.trim();
    const target = buildCard.zh;
    const correct = typed === target;
    const targetChars = Array.from(target);
    const typedChars = Array.from(typed);
    setHardDiff(targetChars.map((ch, i) => ({ ch, ok: typedChars[i] === ch })));
    setHardResult(correct ? "correct" : "wrong");
    registerResult(correct);
  };

  // Autocalifica en nivel fácil cuando ya se colocaron todas las fichas (no hay señuelos)
  useEffect(() => {
    if (mode === "build" && builderLevel === "easy" && buildCard && pool.length === 0 && answer.length > 0 && buildResult === null) {
      const built = answer.map(t => t.ch).join("");
      const correct = built === buildCard.zh;
      setBuildResult(correct ? "correct" : "wrong");
      registerResult(correct);
    }
  }, [pool.length, mode]);

  const startStudy = () => {
    const filtered = ALL_CARDS.filter(c => selectedUnits.includes(c.unit));
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    setDeck(shuffled);
    setCurrentIdx(0);
    setFlipped(false);
    setShowExample(false);
    setRatings({});
    setMode("study");
  };

  const card = deck[currentIdx];
  const color = card ? (UNIT_COLORS[card.unit] || UNIT_COLORS[1]) : UNIT_COLORS[1];
  const isReference = card && card.unit === 30;

  const rate = (r) => {
    setRatings(prev => ({ ...prev, [card.id]: r }));
    setProgress(prev => {
      const updated = { ...prev, [card.id]: computeNextEntry(prev[card.id], r) };
      saveProgress(updated);
      return updated;
    });
    recordActivity(streak, setStreak);
    setAnimating(true);
    window.speechSynthesis.cancel();
    setTimeout(() => {
      setFlipped(false);
      setShowExample(false);
      setAnimating(false);
      if (currentIdx + 1 >= deck.length) {
        setMode("results");
      } else {
        setCurrentIdx(i => i + 1);
      }
    }, 300);
  };

  // Auto-play audio when card flips to reveal Chinese
  useEffect(() => {
    if (flipped && autoPlay && card) speak(card.zh);
  }, [flipped, card?.id]);

  const toggleUnit = (u) => {
    setSelectedUnits(prev =>
      prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]
    );
  };

  const ratedCount = Object.keys(ratings).length;
  const knowCount = Object.values(ratings).filter(r => r === RATING.know).length;
  const almostCount = Object.values(ratings).filter(r => r === RATING.almost).length;
  const dontCount = Object.values(ratings).filter(r => r === RATING.dontKnow).length;

  const front = studyDir === "es→zh" ? card?.es : card?.zh;
  const frontSub = studyDir === "es→zh" ? null : card?.py;
  const back_zh = card?.zh;
  const back_py = card?.py;
  const back_es = card?.es;

  if (mode === "menu") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a0a00 0%, #3d1a00 50%, #1a0a00 100%)", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", fontFamily: "'Georgia', serif" }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h1 style={{ color: "#FF9D3D", fontSize: 24, fontWeight: "bold", margin: 0, letterSpacing: 1 }}>🏯 长城汉语</h1>
          </div>
          <button onClick={() => setMode("settings")} style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12, padding: "8px 12px", color: "#ccc", fontSize: 18, cursor: "pointer"
          }}>
            ⚙️
          </button>
        </div>

        {/* Racha + progreso general */}
        {hasHistory ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16, background: "rgba(255,255,255,0.05)", borderRadius: 18, padding: 16, marginBottom: 14 }}>
            <ProgressRing pct={masteredPct} />
            <div style={{ flex: 1 }}>
              {streak.current > 0 && (
                <p style={{ color: "#FF9D3D", fontSize: 15, fontWeight: "bold", margin: "0 0 6px 0", fontFamily: "sans-serif" }}>
                  🔥 {streak.current} {streak.current === 1 ? "día seguido" : "días seguidos"}
                </p>
              )}
              <div style={{ display: "flex", gap: 12, fontSize: 11, fontFamily: "sans-serif", flexWrap: "wrap" }}>
                <span style={{ color: "#888" }}>🆕 {newCount}</span>
                <span style={{ color: "#FF9D3D" }}>📖 {learningCount}</span>
                <span style={{ color: "#4CAF50" }}>⭐ {masteredCount}</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 18, padding: "18px 16px", marginBottom: 14, textAlign: "center" }}>
            <p style={{ color: "#FF9D3D", fontSize: 15, fontWeight: "bold", margin: "0 0 4px 0", fontFamily: "sans-serif" }}>👋 ¡Bienvenido!</p>
            <p style={{ color: "#aaa", fontSize: 12, margin: 0, fontFamily: "sans-serif" }}>Estudia tu primera tarjeta para empezar a ver tu progreso aquí</p>
          </div>
        )}

        {/* Repaso de hoy */}
        <div style={{
          background: dueCount > 0 ? "linear-gradient(135deg, #FF6B35, #FF9D3D)" : "rgba(76,175,80,0.12)",
          borderRadius: 16, padding: 18, marginBottom: 14,
          border: dueCount > 0 ? "none" : "2px solid rgba(76,175,80,0.35)"
        }}>
          {dueCount > 0 ? (
            <>
              <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: "0 0 2px 0", fontFamily: "sans-serif" }}>📅 Repaso de hoy</p>
              <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, margin: "0 0 8px 0", fontFamily: "sans-serif" }}>
                El sistema elige qué se te va a olvidar pronto, de todas tus unidades
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ color: "white", fontSize: 22, fontWeight: "bold", fontFamily: "sans-serif" }}>{dueCount} tarjetas</span>
                  <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2, fontFamily: "sans-serif" }}>
                    {[newDueCount > 0 && `🆕 ${newDueCount} nuevas`, reviewDueCount > 0 && `🔁 ${reviewDueCount} repaso`].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <button onClick={startReviewToday} style={{
                  background: "white", color: "#FF6B35", border: "none", borderRadius: 12,
                  padding: "10px 20px", fontSize: 14, fontWeight: "bold", cursor: "pointer", fontFamily: "sans-serif"
                }}>
                  Repasar →
                </button>
              </div>
            </>
          ) : (
            <p style={{ color: "#4CAF50", fontSize: 14, margin: 0, fontFamily: "sans-serif", textAlign: "center" }}>
              🎉 ¡Ya repasaste todo por hoy! Vuelve mañana.
            </p>
          )}
        </div>

        {/* Continuar donde quedé */}
        {hasHistory && (
          <button onClick={startStudy} disabled={selectedUnits.length === 0} style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 18px", borderRadius: 14, marginBottom: 18, border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.05)", cursor: selectedUnits.length === 0 ? "not-allowed" : "pointer"
          }}>
            <span style={{ color: "#ccc", fontSize: 13, fontFamily: "sans-serif" }}>▶️ Continuar estudiando</span>
            <span style={{ color: "#666", fontSize: 11, fontFamily: "sans-serif" }}>{studyDir === "es→zh" ? "ES→中" : "中→ES"} · {selectedUnits.length} unidades</span>
          </button>
        )}

        {/* Navegación principal */}
        <button onClick={startStudy} disabled={selectedUnits.length === 0} style={{
          width: "100%", padding: "18px 0", borderRadius: 16, border: "none", marginBottom: 4,
          background: selectedUnits.length === 0 ? "#444" : "linear-gradient(135deg, #FF6B35, #FF9D3D)",
          color: "white", fontSize: 17, fontWeight: "bold", cursor: selectedUnits.length === 0 ? "not-allowed" : "pointer",
          fontFamily: "sans-serif", letterSpacing: 0.5, boxShadow: "0 4px 20px rgba(255,107,53,0.35)"
        }}>
          📚 Flashcards · {ALL_CARDS.filter(c => selectedUnits.includes(c.unit)).length} tarjetas
        </button>
        <p style={{ textAlign: "center", color: "#666", fontSize: 11, margin: "0 0 10px 0", fontFamily: "sans-serif" }}>
          Tú eliges el tema: repasa todas las tarjetas de tus unidades seleccionadas
        </p>

        {/* Selector de nivel para Construir frases */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { v: "easy", label: "🟢 Fácil" },
              { v: "medium", label: "🟡 Medio" },
              { v: "hard", label: "🔴 听写" },
            ].map(lv => (
              <button key={lv.v} onClick={() => setBuilderLevel(lv.v)} style={{
                flex: 1, padding: "7px 0", borderRadius: 10, border: `2px solid ${builderLevel === lv.v ? "#4DD0E1" : "rgba(255,255,255,0.15)"}`,
                background: builderLevel === lv.v ? "rgba(77,208,225,0.15)" : "transparent",
                color: builderLevel === lv.v ? "#4DD0E1" : "#888", fontSize: 11, fontWeight: builderLevel === lv.v ? "bold" : "normal",
                cursor: "pointer", fontFamily: "sans-serif"
              }}>
                {lv.label}
              </button>
            ))}
          </div>
          <button onClick={startBuild} disabled={buildableCards.length === 0} style={{
            width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
            background: buildableCards.length === 0 ? "#444" : "linear-gradient(135deg, #00838F, #4DD0E1)",
            color: "white", fontSize: 15, fontWeight: "bold",
            cursor: buildableCards.length === 0 ? "not-allowed" : "pointer", fontFamily: "sans-serif"
          }}>
            ✏️ Construir frases · {buildableCards.length} disponibles
          </button>
        </div>

        <button onClick={() => setMode("patterns")} style={{
          width: "100%", padding: "16px 0", borderRadius: 16, marginBottom: 18,
          border: "2px solid rgba(255,157,61,0.4)", background: "rgba(255,157,61,0.08)",
          color: "#FF9D3D", fontSize: 15, fontWeight: "bold", cursor: "pointer", fontFamily: "sans-serif"
        }}>
          📐 Patrones gramaticales · {PATTERN_CATEGORIES.reduce((sum, c) => sum + c.ids.length, 0)}
        </button>

        <p onClick={() => setMode("settings")} style={{ textAlign: "center", color: "#666", fontSize: 12, cursor: "pointer", fontFamily: "sans-serif" }}>
          ⚙️ Unidades, dirección, audio y más
        </p>
      </div>
    </div>
  );

  // Pantalla de opciones: dirección, audio, pinyin, selector de unidades, reiniciar progreso
  if (mode === "settings") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a0a00 0%, #3d1a00 50%, #1a0a00 100%)", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", fontFamily: "'Georgia', serif" }}>
      <div style={{ maxWidth: 500, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <button onClick={() => setMode("menu")} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontFamily: "sans-serif" }}>← Inicio</button>
          <span style={{ color: "#FF9D3D", fontSize: 15, fontWeight: "bold", fontFamily: "sans-serif" }}>⚙️ Opciones</span>
          <span style={{ width: 50 }} />
        </div>

        {/* Direction */}
        <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 16, marginBottom: 12 }}>
          <p style={{ color: "#FFD09B", fontSize: 13, margin: "0 0 10px 0", fontFamily: "sans-serif" }}>Dirección de estudio</p>
          <div style={{ display: "flex", gap: 8 }}>
            {["es→zh", "zh→es"].map(d => (
              <button key={d} onClick={() => setStudyDir(d)} style={{
                flex: 1, padding: "10px 0", borderRadius: 10, border: "2px solid",
                borderColor: studyDir === d ? "#FF6B35" : "rgba(255,255,255,0.2)",
                background: studyDir === d ? "rgba(255,107,53,0.2)" : "transparent",
                color: studyDir === d ? "#FF9D3D" : "#aaa",
                cursor: "pointer", fontFamily: "sans-serif", fontSize: 13, fontWeight: studyDir === d ? "bold" : "normal"
              }}>
                {d === "es→zh" ? "🇲🇽 → 🇨🇳 Español a Chino" : "🇨🇳 → 🇲🇽 Chino a Español"}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        {[
          { label: "🔊 Reproducir audio al revelar", val: autoPlay, set: setAutoPlay },
          { label: "拼 Mostrar pinyin al revelar", val: showPinyin, set: setShowPinyin },
        ].map(t => (
          <div key={t.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 16, padding: "12px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#FFD09B", fontSize: 13, fontFamily: "sans-serif" }}>{t.label}</span>
            <div onClick={() => t.set(p => !p)} style={{
              width: 44, height: 24, borderRadius: 12, background: t.val ? "#FF6B35" : "#555",
              cursor: "pointer", position: "relative", transition: "background 0.3s"
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%", background: "white",
                position: "absolute", top: 2, left: t.val ? 22 : 2, transition: "left 0.3s"
              }} />
            </div>
          </div>
        ))}
        <div style={{ marginBottom: 6 }} />

        {/* Unit selector con % de dominio */}
        <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p style={{ color: "#FFD09B", fontSize: 13, margin: 0, fontFamily: "sans-serif" }}>Seleccionar unidades</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSelectedUnits([...units])} style={{ color: "#FF9D3D", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: "sans-serif" }}>Todas</button>
              <button onClick={() => setSelectedUnits([])} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: "sans-serif" }}>Ninguna</button>
            </div>
          </div>

          {/* Book 1 - Textbook units 1-10 */}
          <p style={{ color: "#FF9D3D", fontSize: 11, margin: "0 0 6px 0", fontFamily: "sans-serif", fontWeight: "bold", letterSpacing: 1 }}>📙 LIBRO 1 — Unidades</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 12 }}>
            {units.filter(u => u >= 1 && u <= 10).map(u => {
              const uc = UNIT_COLORS[u];
              const sel = selectedUnits.includes(u);
              const pct = unitMastery(u);
              return (
                <button key={u} onClick={() => toggleUnit(u)} style={{
                  padding: "8px 4px", borderRadius: 10, border: `2px solid ${sel ? uc.accent : "rgba(255,255,255,0.1)"}`,
                  background: sel ? uc.accent : "transparent",
                  color: sel ? "white" : "#888", cursor: "pointer", fontSize: 10,
                  fontFamily: "sans-serif", fontWeight: sel ? "bold" : "normal",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2
                }}>
                  <span style={{ fontSize: 12 }}>U{u}</span>
                  <span style={{ fontSize: 9, opacity: 0.85 }}>{pct > 0 ? `⭐${pct}%` : "—"}</span>
                </button>
              );
            })}
          </div>

          {/* Book 2 */}
          <p style={{ color: "#00838F", fontSize: 11, margin: "0 0 6px 0", fontFamily: "sans-serif", fontWeight: "bold", letterSpacing: 1 }}>📗 LIBRO 2</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {units.filter(u => u > 12 && u !== 30).map(u => {
              const uc = UNIT_COLORS[u];
              const sel = selectedUnits.includes(u);
              const l2num = u - 12;
              const pct = unitMastery(u);
              return (
                <button key={u} onClick={() => toggleUnit(u)} style={{
                  padding: "8px 4px", borderRadius: 10, border: `2px solid ${sel ? uc.accent : "rgba(255,255,255,0.1)"}`,
                  background: sel ? uc.accent : "transparent",
                  color: sel ? "white" : "#888", cursor: "pointer", fontSize: 10,
                  fontFamily: "sans-serif", fontWeight: sel ? "bold" : "normal",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2
                }}>
                  <span style={{ fontSize: 12 }}>U{l2num}</span>
                  <span style={{ fontSize: 9, opacity: 0.85 }}>{pct > 0 ? `⭐${pct}%` : "—"}</span>
                </button>
              );
            })}
          </div>

          <p style={{ color: "#888", fontSize: 12, margin: "10px 0 0 0", fontFamily: "sans-serif", textAlign: "center" }}>
            {ALL_CARDS.filter(c => selectedUnits.includes(c.unit)).length} tarjetas seleccionadas
          </p>
        </div>

        <p onClick={resetProgress} style={{ textAlign: "center", color: "#555", fontSize: 11, marginTop: 8, cursor: "pointer", fontFamily: "sans-serif", textDecoration: "underline" }}>
          Reiniciar progreso guardado
        </p>
      </div>
    </div>
  );

  if (mode === "results") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a0a00, #3d1a00, #1a0a00)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
        <h2 style={{ color: "#FF9D3D", fontSize: 24, marginBottom: 4 }}>¡Ronda completada!</h2>
        <p style={{ color: "#FFD09B", marginBottom: 32, fontSize: 14 }}>{deck.length} tarjetas estudiadas</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 32 }}>
          {[
            { label: "✅ Las sé", count: knowCount, color: "#4CAF50" },
            { label: "🤔 Casi", count: almostCount, color: "#FF9D3D" },
            { label: "❌ Repasar", count: dontCount, color: "#F44336" },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px 8px" }}>
              <div style={{ fontSize: 28, fontWeight: "bold", color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {dueCount > 0 && (
            <button onClick={startReviewToday} style={{ padding: "14px 0", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #FF6B35, #FF9D3D)", color: "white", fontSize: 15, fontWeight: "bold", cursor: "pointer" }}>
              📅 Seguir con el repaso de hoy ({dueCount} pendientes)
            </button>
          )}
          <button onClick={() => {
            const dontKnow = deck.filter(c => ratings[c.id] === RATING.dontKnow || ratings[c.id] === RATING.almost);
            if (dontKnow.length === 0) { startStudy(); return; }
            setDeck(dontKnow.sort(() => Math.random() - 0.5));
            setCurrentIdx(0); setFlipped(false); setRatings({}); setMode("study");
          }} style={{ padding: "14px 0", borderRadius: 14, border: dueCount > 0 ? "2px solid rgba(255,107,53,0.4)" : "none", background: dueCount > 0 ? "transparent" : "linear-gradient(135deg, #FF6B35, #FF9D3D)", color: dueCount > 0 ? "#FF9D3D" : "white", fontSize: 15, fontWeight: "bold", cursor: "pointer" }}>
            🔄 Repasar las que me fallaron
          </button>
          <button onClick={startBuild} disabled={buildableCards.length === 0} style={{ padding: "14px 0", borderRadius: 14, border: "2px solid rgba(0,131,143,0.4)", background: "transparent", color: buildableCards.length === 0 ? "#555" : "#4DD0E1", fontSize: 14, cursor: buildableCards.length === 0 ? "not-allowed" : "pointer" }}>
            ✏️ Construir frases con estas unidades
          </button>
          <button onClick={startStudy} style={{ padding: "14px 0", borderRadius: 14, border: "none", background: "transparent", color: "#999", fontSize: 13, cursor: "pointer" }}>
            🔀 Nueva ronda completa
          </button>
          <button onClick={() => setMode("menu")} style={{ padding: "14px 0", borderRadius: 14, border: "none", background: "transparent", color: "#888", fontSize: 14, cursor: "pointer" }}>
            ← Menú principal
          </button>
        </div>
      </div>
    </div>
  );

  // Modo: lista de categorías de patrones
  if (mode === "patterns") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a0a00, #3d1a00, #1a0a00)", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <button onClick={() => setMode("menu")} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>← Menú</button>
          <span style={{ color: "#FF9D3D", fontSize: 15, fontWeight: "bold" }}>📐 Patrones gramaticales</span>
          <span style={{ width: 40 }} />
        </div>
        <p style={{ color: "#FFD09B", fontSize: 13, textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
          Las estructuras se repiten en muchas unidades. Aquí están agrupadas por tipo, sin importar en qué semana las viste.
        </p>

        {PATTERN_CATEGORIES.map(cat => {
          const pct = categoryMastery(cat);
          return (
            <button key={cat.key} onClick={() => openCategory(cat)} style={{
              width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "16px 18px", borderRadius: 16, marginBottom: 10,
              border: `2px solid ${cat.color}55`, background: `${cat.color}15`,
              cursor: "pointer", textAlign: "left"
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>{cat.icon}</span>
                <span style={{ color: "white", fontSize: 15, fontWeight: "bold" }}>{cat.label}</span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ color: cat.color, fontSize: 13, fontWeight: "bold" }}>{cat.ids.length} →</span>
                <span style={{ color: pct > 0 ? "#4CAF50" : "#888", fontSize: 10, fontFamily: "sans-serif" }}>{pct > 0 ? `⭐${pct}%` : "—"}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // Modo: detalle de una categoría — referencia + practicar
  if (mode === "patternDetail" && selectedCategory) {
    const cat = selectedCategory;
    const cards = ALL_CARDS.filter(c => cat.ids.includes(c.id));
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a0a00, #3d1a00, #1a0a00)", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px", fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: 480, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <button onClick={() => setMode("patterns")} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>← Categorías</button>
            <span style={{ color: cat.color, fontSize: 13, fontWeight: "bold" }}>{cards.length} patrones</span>
          </div>
          <h2 style={{ color: "white", fontSize: 20, textAlign: "center", margin: "6px 0 20px 0" }}>{cat.icon} {cat.label}</h2>

          {cards.map(c => (
            <div key={c.id} style={{
              background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "14px 16px", marginBottom: 10,
              borderLeft: `4px solid ${cat.color}`
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <p style={{ color: "white", fontSize: 17, fontWeight: "bold", margin: "0 0 2px 0" }}>{c.zh}</p>
                  <p style={{ fontSize: 12, fontStyle: "italic", margin: "0 0 6px 0", color: TONE_COLORS_DARK[0] }}>{renderPinyinTone(c.py, true)}</p>
                </div>
                <button onClick={() => speak(c.zh.replace(/[❌✅]/g, ""))} style={{
                  background: "none", border: `1px solid ${cat.color}66`, borderRadius: 20,
                  padding: "3px 8px", color: cat.color, fontSize: 12, cursor: "pointer", flexShrink: 0
                }}>🔊</button>
              </div>
              <p style={{ color: "#ccc", fontSize: 13, margin: "0 0 8px 0", lineHeight: 1.4 }}>{c.es}</p>
              <div style={{ background: `${cat.color}12`, borderRadius: 10, padding: "8px 12px" }}>
                <p style={{ color: cat.color, fontSize: 13, margin: "0 0 2px 0" }}>{c.exZh}</p>
                <p style={{ fontSize: 11, margin: "0 0 2px 0", fontStyle: "italic", color: TONE_COLORS_DARK[0] }}>{renderPinyinTone(c.exPy, true)}</p>
                <p style={{ color: "#aaa", fontSize: 12, margin: 0 }}>{c.exEs}</p>
              </div>
            </div>
          ))}

          <button onClick={() => practiceCategory(cat)} style={{
            width: "100%", padding: "16px 0", borderRadius: 16, border: "none", marginTop: 12,
            background: `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)`, color: "white",
            fontSize: 15, fontWeight: "bold", cursor: "pointer"
          }}>
            🎯 Practicar estos patrones
          </button>
        </div>
      </div>
    );
  }

  if (mode === "buildResults") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a0a00, #3d1a00, #1a0a00)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>✏️</div>
        <h2 style={{ color: "#4DD0E1", fontSize: 24, marginBottom: 4 }}>¡Ronda de frases completada!</h2>
        <p style={{ color: "#FFD09B", marginBottom: 32, fontSize: 14 }}>{buildDeck.length} frases construidas</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 32 }}>
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px 8px" }}>
            <div style={{ fontSize: 28, fontWeight: "bold", color: "#4CAF50" }}>{buildStats.correct}</div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>✅ A la primera</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px 8px" }}>
            <div style={{ fontSize: 28, fontWeight: "bold", color: "#F44336" }}>{buildStats.wrong}</div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>❌ Con errores</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={startBuild} style={{ padding: "14px 0", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #00838F, #4DD0E1)", color: "white", fontSize: 15, fontWeight: "bold", cursor: "pointer" }}>
            🔀 Otra ronda
          </button>
          <button onClick={startStudy} style={{ padding: "14px 0", borderRadius: 14, border: "2px solid rgba(255,107,53,0.4)", background: "transparent", color: "#FF9D3D", fontSize: 14, cursor: "pointer" }}>
            📚 Repasar como flashcards
          </button>
          {dueCount > 0 && (
            <button onClick={startReviewToday} style={{ padding: "14px 0", borderRadius: 14, border: "none", background: "transparent", color: "#999", fontSize: 13, cursor: "pointer" }}>
              📅 Tienes {dueCount} pendientes de repaso hoy
            </button>
          )}
          <button onClick={() => setMode("menu")} style={{ padding: "14px 0", borderRadius: 14, border: "none", background: "transparent", color: "#888", fontSize: 14, cursor: "pointer" }}>
            ← Menú principal
          </button>
        </div>
      </div>
    </div>
  );

  // Modo: Construir frases
  if (mode === "build") {
    if (!buildCard) return null;
    const color2 = UNIT_COLORS[buildCard.unit] || UNIT_COLORS[1];
    const isHard = builderLevel === "hard";
    const isMedium = builderLevel === "medium";
    const resolved = isHard ? hardResult !== null : buildResult !== null;
    const wasCorrect = isHard ? hardResult === "correct" : buildResult === "correct";
    const wasWrong = isHard ? hardResult === "wrong" : buildResult === "wrong";

    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a0a00, #3d1a00, #1a0a00)", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px", fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: 480, width: "100%" }}>

          {/* Top bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button onClick={() => setMode("menu")} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>← Menú</button>
            <span style={{ color: "#FFD09B", fontSize: 13 }}>{buildIdx + 1} / {buildDeck.length}</span>
            <span style={{ color: color2.accent, fontSize: 12, background: "rgba(255,255,255,0.1)", padding: "3px 10px", borderRadius: 20, fontWeight: "bold" }}>
              {isHard ? "🔴 听写" : isMedium ? "🟡 Medio" : "🟢 Fácil"}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 4, height: 5, marginBottom: 20, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(buildIdx / buildDeck.length) * 100}%`, background: "linear-gradient(90deg, #00838F, #4DD0E1)", borderRadius: 4, transition: "width 0.4s" }} />
          </div>

          {/* Prompt */}
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: "16px 18px", marginBottom: 16, textAlign: "center" }}>
            <p style={{ color: "#4DD0E1", fontSize: 11, margin: "0 0 8px 0", letterSpacing: 1 }}>
              {isHard ? "ESCRIBE ESTA FRASE EN CHINO" : "ARMA ESTA FRASE EN CHINO"}
            </p>
            <p style={{ color: "white", fontSize: 18, margin: 0, lineHeight: 1.4 }}>{buildCard.es}</p>
          </div>

          {isHard ? (
            <>
              {/* Campo de escritura libre — 听写 */}
              <textarea
                value={typedAnswer}
                onChange={e => setTypedAnswer(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!resolved) checkHardAnswer(); } }}
                placeholder="打字…（使用中文键盘）"
                disabled={wasCorrect}
                style={{
                  width: "100%", minHeight: 60, background: "rgba(255,255,255,0.05)",
                  border: `2px solid ${wasCorrect ? "#4CAF50" : wasWrong ? "#F44336" : "rgba(255,255,255,0.15)"}`,
                  borderRadius: 14, padding: 14, fontSize: 26, color: "white",
                  fontFamily: "sans-serif", resize: "none", marginBottom: 12, boxSizing: "border-box"
                }}
              />

              {wasCorrect && <p style={{ textAlign: "center", color: "#4CAF50", fontSize: 15, fontWeight: "bold", marginBottom: 12 }}>✅ ¡Correcto!</p>}
              {wasWrong && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ textAlign: "center", color: "#F44336", fontSize: 14, marginBottom: 8 }}>❌ No coincide. Así se compara, carácter por carácter:</p>
                  <p style={{ textAlign: "center", fontSize: 26, letterSpacing: 2 }}>
                    {hardDiff.map((d, i) => (
                      <span key={i} style={{ color: d.ok ? "#4CAF50" : "#F44336" }}>{d.ch}</span>
                    ))}
                  </p>
                </div>
              )}

              {!wasCorrect && (
                <button onClick={checkHardAnswer} style={{
                  width: "100%", padding: "12px 0", borderRadius: 14, border: "none", marginBottom: 16,
                  background: "linear-gradient(135deg, #00838F, #4DD0E1)", color: "white", fontSize: 14, fontWeight: "bold", cursor: "pointer"
                }}>
                  Verificar
                </button>
              )}
            </>
          ) : (
            <>
              {/* Answer area */}
              <div style={{
                minHeight: 70, background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 14, marginBottom: 16,
                display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "center",
                border: `2px solid ${wasCorrect ? "#4CAF50" : wasWrong ? "#F44336" : "rgba(255,255,255,0.15)"}`,
                transition: "border-color 0.3s"
              }}>
                {answer.length === 0 && <span style={{ color: "#555", fontSize: 13 }}>Toca las fichas de abajo en orden</span>}
                {answer.map(tile => (
                  <button key={tile.uid} onClick={() => tapAnswerTile(tile)} style={{
                    fontSize: 26, padding: "8px 14px", borderRadius: 10, border: "none",
                    background: wasCorrect ? "rgba(76,175,80,0.25)" : "rgba(77,208,225,0.15)",
                    color: wasCorrect ? "#4CAF50" : "#4DD0E1",
                    cursor: wasCorrect ? "default" : "pointer", fontFamily: "sans-serif"
                  }} disabled={wasCorrect}>
                    {tile.ch}
                  </button>
                ))}
              </div>

              {/* Feedback message */}
              {wasCorrect && (
                <p style={{ textAlign: "center", color: "#4CAF50", fontSize: 15, fontWeight: "bold", marginBottom: 12 }}>✅ ¡Correcto!</p>
              )}
              {wasWrong && (
                <p style={{ textAlign: "center", color: "#F44336", fontSize: 14, marginBottom: 12 }}>
                  {isMedium ? "❌ Revisa — puede que haya una ficha de más en tu respuesta" : "❌ Casi — revisa el orden y ajusta las fichas"}
                </p>
              )}

              {/* Tile pool */}
              <div style={{
                minHeight: 70, borderRadius: 16, padding: 14, marginBottom: isMedium ? 8 : 16,
                display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "center"
              }}>
                {pool.map(tile => (
                  <button key={tile.uid} onClick={() => tapPoolTile(tile)} style={{
                    fontSize: 26, padding: "8px 14px", borderRadius: 10,
                    border: `2px solid ${color2.accent}66`, background: color2.bg,
                    color: "#1a0a00", cursor: "pointer", fontFamily: "sans-serif", fontWeight: "bold"
                  }}>
                    {tile.ch}
                  </button>
                ))}
              </div>

              {isMedium && !wasCorrect && (
                <button onClick={checkMediumAnswer} disabled={answer.length === 0} style={{
                  width: "100%", padding: "12px 0", borderRadius: 14, border: "none", marginBottom: 16,
                  background: answer.length === 0 ? "#444" : "linear-gradient(135deg, #00838F, #4DD0E1)",
                  color: "white", fontSize: 14, fontWeight: "bold", cursor: answer.length === 0 ? "not-allowed" : "pointer"
                }}>
                  Verificar
                </button>
              )}
            </>
          )}

          {/* Answer reveal */}
          {showBuildAnswer && (
            <div style={{ background: `${color2.accent}15`, borderRadius: 14, padding: "12px 16px", marginBottom: 16, textAlign: "center" }}>
              <p style={{ fontSize: 22, color: color2.accent, fontWeight: "bold", margin: "0 0 4px 0" }}>{buildCard.zh}</p>
              <p style={{ fontSize: 14, margin: "0 0 4px 0", fontStyle: "italic", color: TONE_COLORS_DARK[0] }}>{renderPinyinTone(buildCard.py, true)}</p>
              <p style={{ fontSize: 13, color: "#ccc", margin: 0 }}>{buildCard.es}</p>
            </div>
          )}

          {/* Bottom actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => speak(buildCard.zh)} style={{
              padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.06)", color: "#aaa", fontSize: 13, cursor: "pointer"
            }}>
              🔊
            </button>
            {!showBuildAnswer && !resolved ? (
              <button onClick={() => setShowBuildAnswer(true)} style={{
                flex: 1, padding: "12px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.06)", color: "#aaa", fontSize: 13, cursor: "pointer"
              }}>
                🙈 Ver respuesta
              </button>
            ) : (
              <button onClick={nextBuildCard} style={{
                flex: 1, padding: "12px 0", borderRadius: 14, border: "none",
                background: "linear-gradient(135deg, #00838F, #4DD0E1)", color: "white", fontSize: 14, fontWeight: "bold", cursor: "pointer"
              }}>
                Siguiente →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Study mode
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a0a00, #3d1a00, #1a0a00)", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 480, width: "100%" }}>

        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button onClick={() => setMode("menu")} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>← Menú</button>
          <span style={{ color: "#FFD09B", fontSize: 13 }}>{currentIdx + 1} / {deck.length}</span>
          <span style={{ color: color.accent, fontSize: 12, background: "rgba(255,255,255,0.1)", padding: "3px 10px", borderRadius: 20, fontWeight: "bold" }}>
            {card.unit <= 10 || card.unit === 30 ? card.unitName : `L2 · U${card.unit - 12}`}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 4, height: 5, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${((currentIdx) / deck.length) * 100}%`, background: "linear-gradient(90deg, #FF6B35, #FF9D3D)", borderRadius: 4, transition: "width 0.4s" }} />
        </div>

        {/* Card */}
        <div onClick={() => !flipped && setFlipped(true)} style={{
          background: flipped ? color.bg : "rgba(255,255,255,0.05)",
          borderRadius: 24, padding: "32px 24px", minHeight: 260,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          cursor: flipped ? "default" : "pointer",
          borderTop: `2px solid ${flipped ? color.accent : "rgba(255,255,255,0.1)"}`,
          borderRight: `2px solid ${flipped ? color.accent : "rgba(255,255,255,0.1)"}`,
          borderBottom: `2px solid ${flipped ? color.accent : "rgba(255,255,255,0.1)"}`,
          borderLeft: `6px solid ${color.accent}`,
          transition: "all 0.35s ease", boxShadow: flipped ? `0 8px 32px ${color.accent}33` : "none",
          opacity: animating ? 0 : 1,
          transform: animating ? "scale(0.95)" : "scale(1)"
        }}>
          {!flipped ? (
            <>
              {isReference && (
                <span style={{
                  background: `${color.accent}22`, border: `1px solid ${color.accent}55`, color: color.accent,
                  borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: "bold", marginBottom: 14
                }}>
                  📖 Ficha de referencia
                </span>
              )}
              {studyDir === "zh→es" && (
                <>
                  <div style={{ fontSize: 42, fontWeight: "bold", color: "white", marginBottom: 12, textAlign: "center" }}>{card.zh}</div>
                  <button onClick={(e) => { e.stopPropagation(); speak(card.zh); }} style={{
                    background: speaking ? "rgba(255,107,53,0.3)" : "rgba(255,255,255,0.1)",
                    border: `1px solid ${speaking ? "#FF6B35" : "rgba(255,255,255,0.2)"}`,
                    borderRadius: 30, padding: "8px 18px", color: speaking ? "#FF9D3D" : "#aaa",
                    fontSize: 15, cursor: "pointer", marginBottom: 12,
                    transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6
                  }}>
                    {speaking ? "🔊 Reproduciendo..." : "🔊 Escuchar"}
                  </button>
                  <FrontPinyinReveal pinyin={card.py} cardId={card.id} />
                </>
              )}
              {studyDir === "es→zh" && (
                <div style={{ fontSize: 22, color: "white", textAlign: "center", lineHeight: 1.4 }}>{card.es}</div>
              )}
              <div style={{ marginTop: 16, color: "#555", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <span>👆</span> {isReference ? "Toca para ver la explicación" : "Toca para revelar"}
              </div>
            </>
          ) : (
            <>
              {card.emoji && <div style={{ fontSize: 34, marginBottom: 4 }}>{card.emoji}</div>}
              <div style={{ fontSize: 38, fontWeight: "bold", color: color.accent, marginBottom: 4, textAlign: "center" }}>{back_zh}</div>
              {showPinyin && <div style={{ fontSize: 15, marginBottom: 6, color: TONE_COLORS_LIGHT[0] }}>{renderPinyinTone(back_py, false)}</div>}
              <div style={{ fontSize: 18, color: "#333", marginBottom: 12, textAlign: "center" }}>{back_es}</div>

              {/* Speaker button on back */}
              <button onClick={(e) => { e.stopPropagation(); speak(card.zh); }} style={{
                background: speaking ? `${color.accent}33` : `${color.accent}15`,
                border: `1px solid ${color.accent}66`,
                borderRadius: 30, padding: "7px 18px", color: color.accent,
                fontSize: 14, cursor: "pointer", marginBottom: 10,
                transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6
              }}>
                {speaking ? "🔊 Reproduciendo..." : "🔊 Escuchar de nuevo"}
              </button>

              <button onClick={(e) => { e.stopPropagation(); setShowExample(s => !s); }} style={{
                background: "none", border: `1px solid ${color.accent}44`, borderRadius: 20, padding: "6px 14px",
                color: color.accent, fontSize: 12, cursor: "pointer"
              }}>
                {showExample ? "▲ Ocultar ejemplo" : "▼ Ver ejemplo"}
              </button>

              {showExample && <ExampleBox card={card} color={color} speak={speak} speaking={speaking} />}
            </>
          )}
        </div>

        {/* Rating buttons */}
        {flipped && (
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            {[
              { label: "❌ No la sé", value: RATING.dontKnow, color: "#F44336", bg: "rgba(244,67,54,0.15)" },
              { label: "🤔 Casi", value: RATING.almost, color: "#FF9D3D", bg: "rgba(255,157,61,0.15)" },
              { label: "✅ La sé", value: RATING.know, color: "#4CAF50", bg: "rgba(76,175,80,0.15)" },
            ].map(btn => (
              <button key={btn.value} onClick={() => rate(btn.value)} style={{
                flex: 1, padding: "14px 4px", borderRadius: 14, border: `2px solid ${btn.color}66`,
                background: btn.bg, color: btn.color, fontSize: 12, fontWeight: "bold",
                cursor: "pointer", transition: "transform 0.1s"
              }}>
                {btn.label}
              </button>
            ))}
          </div>
        )}

        {!flipped && (
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={() => setFlipped(true)} style={{
              flex: 1, padding: "14px 0", borderRadius: 14, border: "2px solid rgba(255,107,53,0.4)",
              background: "rgba(255,107,53,0.1)", color: "#FF9D3D", fontSize: 14, fontWeight: "bold", cursor: "pointer"
            }}>
              {isReference ? "Ver explicación 📖" : "Revelar 👁"}
            </button>
          </div>
        )}

        {/* Mini stats */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 20, fontSize: 12, color: "#666" }}>
          <span style={{ color: "#4CAF50" }}>✅ {knowCount}</span>
          <span style={{ color: "#FF9D3D" }}>🤔 {almostCount}</span>
          <span style={{ color: "#F44336" }}>❌ {dontCount}</span>
        </div>
      </div>
    </div>
  );
}
