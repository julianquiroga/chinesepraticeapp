const { useState, useEffect, useCallback, useRef } = React;

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
    <div style={{ fontSize: 16, color: "#FF9D3D", fontStyle: "italic" }}>{pinyin}</div>
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
        <p style={{ fontSize: 13, color: "#666", textAlign: "center", margin: "0 0 6px 0", fontStyle: "italic" }}>
          {card.exPy}
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

function App() {
  const [selectedUnits, setSelectedUnits] = useState([1,2,3,4,5,6,7,8,9,10,13,14,15,16,17,18,19]);
  const [mode, setMode] = useState("menu");
  const [deck, setDeck] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showPinyin, setShowPinyin] = useState(true);
  const [showExample, setShowExample] = useState(false);
  const [ratings, setRatings] = useState({});
  const [studyDir, setStudyDir] = useState("es→zh");
  const [animating, setAnimating] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [progress, setProgress] = useState(() => loadProgress());
  const { speak, speaking, voiceReady } = useSpeech();

  const units = [...new Set(ALL_CARDS.map(c => c.unit))].sort((a,b)=>a-b);

  const dueCards = ALL_CARDS.filter(c => isDue(c.id, progress));
  const dueCount = dueCards.length;
  const masteredCount = Object.values(progress).filter(p => p.box >= MAX_BOX).length;
  const learningCount = Object.values(progress).filter(p => p.box < MAX_BOX).length;
  const newCount = ALL_CARDS.length - Object.keys(progress).length;

  const resetProgress = () => {
    if (window.confirm("¿Seguro que quieres borrar todo tu progreso guardado? Esto no se puede deshacer.")) {
      setProgress({});
      saveProgress({});
    }
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
  const color = card ? UNIT_COLORS[card.unit] : UNIT_COLORS[1];

  const rate = (r) => {
    setRatings(prev => ({ ...prev, [card.id]: r }));
    setProgress(prev => {
      const updated = { ...prev, [card.id]: computeNextEntry(prev[card.id], r) };
      saveProgress(updated);
      return updated;
    });
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
      <div style={{ maxWidth: 500, width: "100%" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏯</div>
          <h1 style={{ color: "#FF9D3D", fontSize: 28, fontWeight: "bold", margin: 0, letterSpacing: 1 }}>长城汉语</h1>
          <p style={{ color: "#FFD09B", fontSize: 14, marginTop: 4 }}>Great Wall Chinese · Flashcards</p>
        </div>

        {/* Repaso de hoy */}
        <div style={{
          background: dueCount > 0 ? "linear-gradient(135deg, #FF6B35, #FF9D3D)" : "rgba(76,175,80,0.12)",
          borderRadius: 16, padding: 18, marginBottom: 16,
          border: dueCount > 0 ? "none" : "2px solid rgba(76,175,80,0.35)"
        }}>
          {dueCount > 0 ? (
            <>
              <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: "0 0 4px 0", fontFamily: "sans-serif" }}>📅 Repaso de hoy</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "white", fontSize: 22, fontWeight: "bold", fontFamily: "sans-serif" }}>{dueCount} tarjetas</span>
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

        {/* Estadísticas de progreso */}
        <div style={{ display: "flex", justifyContent: "center", gap: 18, marginBottom: 20, fontSize: 12, fontFamily: "sans-serif" }}>
          <span style={{ color: "#888" }}>🆕 {newCount} nuevas</span>
          <span style={{ color: "#FF9D3D" }}>📖 {learningCount} aprendiendo</span>
          <span style={{ color: "#4CAF50" }}>⭐ {masteredCount} dominadas</span>
        </div>

        {/* Direction */}
        <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
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

        {/* Unit selector */}
        <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 16, marginBottom: 24 }}>
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
              const unitCards = ALL_CARDS.filter(c => c.unit === u);
              return (
                <button key={u} onClick={() => toggleUnit(u)} style={{
                  padding: "8px 4px", borderRadius: 10, border: `2px solid ${sel ? uc.accent : "rgba(255,255,255,0.1)"}`,
                  background: sel ? uc.accent : "transparent",
                  color: sel ? "white" : "#888", cursor: "pointer", fontSize: 10,
                  fontFamily: "sans-serif", fontWeight: sel ? "bold" : "normal",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2
                }}>
                  <span style={{ fontSize: 12 }}>U{u}</span>
                  <span style={{ fontSize: 9, opacity: 0.8 }}>{unitCards.length}f</span>
                </button>
              );
            })}
          </div>

          {/* Book 2 */}
          <p style={{ color: "#00838F", fontSize: 11, margin: "0 0 6px 0", fontFamily: "sans-serif", fontWeight: "bold", letterSpacing: 1 }}>📗 LIBRO 2</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {units.filter(u => u > 12).map(u => {
              const uc = UNIT_COLORS[u];
              const sel = selectedUnits.includes(u);
              const unitCards = ALL_CARDS.filter(c => c.unit === u);
              const l2num = u - 12;
              return (
                <button key={u} onClick={() => toggleUnit(u)} style={{
                  padding: "8px 4px", borderRadius: 10, border: `2px solid ${sel ? uc.accent : "rgba(255,255,255,0.1)"}`,
                  background: sel ? uc.accent : "transparent",
                  color: sel ? "white" : "#888", cursor: "pointer", fontSize: 10,
                  fontFamily: "sans-serif", fontWeight: sel ? "bold" : "normal",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2
                }}>
                  <span style={{ fontSize: 12 }}>U{l2num}</span>
                  <span style={{ fontSize: 9, opacity: 0.8 }}>{unitCards.length}f</span>
                </button>
              );
            })}
          </div>

          <p style={{ color: "#888", fontSize: 12, margin: "10px 0 0 0", fontFamily: "sans-serif", textAlign: "center" }}>
            {ALL_CARDS.filter(c => selectedUnits.includes(c.unit)).length} tarjetas seleccionadas
          </p>
        </div>

        <button onClick={startStudy} disabled={selectedUnits.length === 0} style={{
          width: "100%", padding: "16px 0", borderRadius: 16, border: "none",
          background: selectedUnits.length === 0 ? "#444" : "linear-gradient(135deg, #FF6B35, #FF9D3D)",
          color: "white", fontSize: 18, fontWeight: "bold", cursor: selectedUnits.length === 0 ? "not-allowed" : "pointer",
          fontFamily: "sans-serif", letterSpacing: 1, boxShadow: "0 4px 20px rgba(255,107,53,0.4)"
        }}>
          开始学习 · Empezar
        </button>

        <p onClick={resetProgress} style={{ textAlign: "center", color: "#555", fontSize: 11, marginTop: 18, cursor: "pointer", fontFamily: "sans-serif", textDecoration: "underline" }}>
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
          <button onClick={() => {
            const dontKnow = deck.filter(c => ratings[c.id] === RATING.dontKnow || ratings[c.id] === RATING.almost);
            if (dontKnow.length === 0) { startStudy(); return; }
            setDeck(dontKnow.sort(() => Math.random() - 0.5));
            setCurrentIdx(0); setFlipped(false); setRatings({}); setMode("study");
          }} style={{ padding: "14px 0", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #FF6B35, #FF9D3D)", color: "white", fontSize: 15, fontWeight: "bold", cursor: "pointer" }}>
            🔄 Repasar las que me fallaron
          </button>
          <button onClick={startStudy} style={{ padding: "14px 0", borderRadius: 14, border: "2px solid rgba(255,107,53,0.4)", background: "transparent", color: "#FF9D3D", fontSize: 15, cursor: "pointer" }}>
            🔀 Nueva ronda completa
          </button>
          <button onClick={() => setMode("menu")} style={{ padding: "14px 0", borderRadius: 14, border: "none", background: "transparent", color: "#888", fontSize: 14, cursor: "pointer" }}>
            ← Menú principal
          </button>
        </div>
      </div>
    </div>
  );

  // Study mode
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a0a00, #3d1a00, #1a0a00)", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 480, width: "100%" }}>

        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button onClick={() => setMode("menu")} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>← Menú</button>
          <span style={{ color: "#FFD09B", fontSize: 13 }}>{currentIdx + 1} / {deck.length}</span>
          <span style={{ color: color.accent, fontSize: 12, background: "rgba(255,255,255,0.1)", padding: "3px 10px", borderRadius: 20, fontWeight: "bold" }}>
            {card.unit <= 10 ? card.unitName : `L2 · U${card.unit - 12}`}
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
          border: `2px solid ${flipped ? color.accent : "rgba(255,255,255,0.1)"}`,
          transition: "all 0.35s ease", boxShadow: flipped ? `0 8px 32px ${color.accent}33` : "none",
          opacity: animating ? 0 : 1,
          transform: animating ? "scale(0.95)" : "scale(1)"
        }}>
          {!flipped ? (
            <>
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
                <span>👆</span> Toca para revelar
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 38, fontWeight: "bold", color: color.accent, marginBottom: 4, textAlign: "center" }}>{back_zh}</div>
              {showPinyin && <div style={{ fontSize: 15, color: "#777", marginBottom: 6 }}>{back_py}</div>}
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
              Revelar 👁
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
