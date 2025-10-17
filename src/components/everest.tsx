import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { v4 as uuid } from "uuid";
import { Card, CardHeader, CardContent } from "./ui/card";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

// Utility: format time and currency
const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
};

const fmtMoney = (n: number, currency = "CHF") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);

// Oxygen / altitude toy model (fun & illustrative, not medical-grade!)
// Assumptions:
// - Room height fixed at 3 m
// - Initial O2 fraction ~20.9%
// - Each person consumes ~0.5 L O2 / min at rest (can be 1.0+ when speaking). We'll expose a factor.
// - Convert O2 volume removed to fraction decrease in closed room; map to "equivalent altitude"
// Mapping: we approximate equivalent altitude by matching partial pressure ratio using barometric formula
// P(h) ~ P0 * exp(-h/7000). Equivalent fraction f_eq => exp(-h/7000) * 0.209 ≈ f_current
// => h ≈ -7000 * ln(f_current / 0.209)

function equivalentAltitudeFromFraction(frac: number) {
  const f0 = 0.209;
  if (frac <= 0) return 8848; // cap
  const ratio = frac / f0;
  const h = -7000 * Math.log(ratio);
  return Math.max(0, Math.min(8848, h));
}

// Compute current oxygen fraction in a room given time, people, and room size
function computeO2Fraction({
  seconds,
  onsite,
  roomArea,
  ceiling = 3,
  perPersonO2Lpm = 0.6, // a bit talky meeting :-)
}: {
  seconds: number;
  onsite: number;
  roomArea: number; // m^2
  ceiling?: number; // m
  perPersonO2Lpm?: number; // liters per minute of pure O2 consumption
}) {
  const volume_m3 = Math.max(1, roomArea * ceiling); // m^3
  const volume_L = volume_m3 * 1000; // liters
  const f0 = 0.209; // initial fraction
  const totalO2_L_initial = volume_L * f0;
  const consumed = onsite * perPersonO2Lpm * (seconds / 60);
  const remaining = Math.max(0, totalO2_L_initial - consumed);
  const frac = Math.max(0.01, remaining / volume_L); // avoid zero
  return {
    frac: Math.min(f0, frac), // can't exceed initial
    percent: Math.min(20.9, Math.min(f0, frac) * 100),
    consumed_L: Math.max(0, consumed),
    volume_L,
  };
}

// Everest panel: renders a simple SVG mountain with a moving marker and dead zone band
function EverestPanel({
  altitudeM,
  fractionPercent,
}: Readonly<{ altitudeM: number; fractionPercent: number }>) {
  const maxH = 8848;
  const pct = Math.min(1, Math.max(0, altitudeM / maxH));

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">Everest Oxygen Comparator</div>
          <Badge>{fractionPercent.toFixed(1)}% O₂</Badge>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Marker climbs as room air becomes like higher altitude
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="relative h-[420px]">
          {/* Dead zone band (8000-8848 m) */}
          <div
            className="absolute inset-x-0"
            style={{
              top: `${(1 - 8000 / 8848) * 100}%`,
              height: `${((8848 - 8000) / 8848) * 100}%`,
            }}>
            <div className="w-full h-full bg-red-100/70 border-y border-red-300 flex items-start">
              <span className="text-[10px] text-red-700 px-2 pt-1">
                Dead zone ≥ 8000 m
              </span>
            </div>
          </div>

          <svg viewBox="0 0 200 420" className="w-full h-full">
            {/* Sky gradient */}
            <defs>
              <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#e0f2fe" />
                <stop offset="100%" stopColor="#ffffff" />
              </linearGradient>
              <linearGradient id="snow" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#e5e7eb" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="200" height="420" fill="url(#sky)" />
            {/* Mountain silhouette */}
            <path
              d="M0 380 L60 260 L95 300 L130 230 L160 260 L200 200 L200 420 L0 420 Z"
              fill="#94a3b8"
            />
            {/* Snow cap */}
            <path d="M120 230 L130 215 L140 230 L130 235 Z" fill="url(#snow)" />

            {/* Altitude ticks */}
            {Array.from({ length: 10 }).map((_, i) => {
              const y = 380 - i * (380 / 9);
              const alt = Math.round(i * (8848 / 9));
              return (
                <g key={i}>
                  <line
                    x1="10"
                    x2="40"
                    y1={y}
                    y2={y}
                    stroke="#475569"
                    strokeWidth="0.5"
                  />
                  <text x="45" y={y + 3} fontSize="8" fill="#475569">
                    {alt} m
                  </text>
                </g>
              );
            })}

            {/* Climbing marker */}
            {(() => {
              const y = 380 - pct * 380; // 0 at base (380)
              return (
                <g>
                  <line
                    x1="80"
                    x2="80"
                    y1={y}
                    y2="380"
                    stroke="#0f172a"
                    strokeDasharray="2,2"
                  />
                  <circle cx="80" cy={y} r="6" fill="#0f172a" />
                  <text x="90" y={y - 4} fontSize="10" fill="#0f172a">
                    ≈ {Math.round(altitudeM)} m
                  </text>
                </g>
              );
            })()}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

export function EverestMeetingMeter() {
  // Inputs
  const [numOnsite, setNumOnsite] = useState<number>(4);
  const [numRemote, setNumRemote] = useState<number>(2);
  const [roomArea, setRoomArea] = useState<number>(30); // m^2
  const [hourlyCostPerPerson, setHourlyCostPerPerson] = useState<number>(80);
  const [currency, setCurrency] = useState<string>("CHF");
  const [o2Lpm, setO2Lpm] = useState<number>(0.6);

  // Timer
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) {
      lastTickRef.current = null;
      return;
    }
    const raf = () => {
      const now = performance.now();
      if (lastTickRef.current == null) lastTickRef.current = now;
      const dt = (now - lastTickRef.current) / 1000;
      if (dt >= 0.05) {
        // throttle ~20Hz
        setElapsed((prev) => prev + dt);
        lastTickRef.current = now;
      }
      id.current = requestAnimationFrame(raf);
    };
    const id = { current: 0 as any };
    id.current = requestAnimationFrame(raf);
    return () => cancelAnimationFrame(id.current);
  }, [isRunning]);

  const onsite = Math.max(0, Math.floor(numOnsite));
  const remote = Math.max(0, Math.floor(numRemote));
  const participants = onsite + remote;

  // Oxygen
  const o2 = useMemo(
    () =>
      computeO2Fraction({
        seconds: elapsed,
        onsite,
        roomArea,
        perPersonO2Lpm: o2Lpm,
      }),
    [elapsed, onsite, roomArea, o2Lpm]
  );
  const eqAlt = useMemo(
    () => equivalentAltitudeFromFraction(o2.frac),
    [o2.frac]
  );

  // Cost calculation
  const costPerSecondPerPerson = hourlyCostPerPerson / 3600;
  const liveCost = participants * costPerSecondPerPerson * elapsed;

  // Topics & notes
  type Note = { id: string; ts: number; topic: string; text: string };
  const [topic, setTopic] = useState("");
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);

  const addNote = () => {
    const t = topic.trim();
    const n = note.trim();
    if (!t && !n) return;
    setNotes((prev) => [
      { id: uuid(), ts: elapsed, topic: t || "(untitled)", text: n },
      ...prev,
    ]);
    setNote("");
  };

  const controls = useAnimationControls();
  useEffect(() => {
    controls.start({
      scale: isRunning ? 1.05 : 1.0,
      transition: { type: "spring", stiffness: 200, damping: 12 },
    });
  }, [isRunning]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white text-gray-900">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        <header className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Everest Meeting Meter
            </h1>
            <p className="text-sm text-gray-600">
              Track live meeting cost, take notes, and visualize room oxygen vs.
              Everest altitude — including the dead zone.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge>Participants: {participants}</Badge>
            <Badge>Onsite: {onsite}</Badge>
            <Badge>Remote: {remote}</Badge>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: controls */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <div className="font-semibold">Setup</div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="onsite">People onsite</Label>
                  <Input
                    id="onsite"
                    type="number"
                    min={0}
                    value={numOnsite}
                    onChange={(e: any) => setNumOnsite(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="remote">People remote</Label>
                  <Input
                    id="remote"
                    type="number"
                    min={0}
                    value={numRemote}
                    onChange={(e: any) => setNumRemote(Number(e.target.value))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="area">Room area (m²)</Label>
                    <Input
                      id="area"
                      type="number"
                      min={5}
                      value={roomArea}
                      onChange={(e: any) => setRoomArea(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="o2">O₂ L/min per person</Label>
                    <Input
                      id="o2"
                      type="number"
                      step={0.1}
                      min={0.1}
                      value={o2Lpm}
                      onChange={(e: any) => setO2Lpm(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cost">Hourly cost per person</Label>
                    <Input
                      id="cost"
                      type="number"
                      min={0}
                      value={hourlyCostPerPerson}
                      onChange={(e: any) =>
                        setHourlyCostPerPerson(Number(e.target.value))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      value={currency}
                      onChange={(e: any) =>
                        setCurrency(e.target.value || "CHF")
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button onClick={() => setIsRunning((r) => !r)}>
                    {isRunning ? "Pause" : elapsed > 0 ? "Resume" : "Start"}
                  </Button>
                  <Button
                    className="bg-gray-800"
                    onClick={() => {
                      setIsRunning(false);
                      setElapsed(0);
                    }}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="font-semibold">Live Cost</div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-sm text-gray-500">Elapsed</div>
                    <motion.div
                      animate={controls}
                      className="text-3xl font-bold tabular-nums">
                      {fmtTime(elapsed)}
                    </motion.div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Cost so far</div>
                    <motion.div
                      animate={controls}
                      className="text-3xl font-extrabold tabular-nums">
                      {fmtMoney(liveCost, currency)}
                    </motion.div>
                    <div className="text-xs text-gray-500 mt-1">
                      {participants} × {fmtMoney(hourlyCostPerPerson, currency)}
                      /h
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="font-semibold">Room Oxygen (toy model)</div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Current O₂</div>
                    <div className="font-bold">{o2.percent.toFixed(2)}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-500">Equiv. altitude</div>
                    <div className="font-bold">≈ {Math.round(eqAlt)} m</div>
                  </div>
                  <div>
                    <div className="text-gray-500">O₂ consumed</div>
                    <div className="font-bold">
                      {o2.consumed_L.toFixed(0)} L
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-500">Room volume</div>
                    <div className="font-bold">
                      {(o2.volume_L / 1000).toFixed(1)} m³
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-gray-400 mt-2">
                  Illustrative only. Real rooms exchange air; use this as a
                  playful awareness tool.
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Middle: notes & topics */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Topics & Notes</div>
                  {isRunning ? (
                    <Badge className="bg-emerald-100 text-emerald-700">
                      Recording
                    </Badge>
                  ) : (
                    <Badge>Idle</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="topic">Topic</Label>
                  <Input
                    id="topic"
                    placeholder="e.g., Roadmap Q4"
                    value={topic}
                    onChange={(e: any) => setTopic(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="note">Note</Label>
                  <textarea
                    id="note"
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black/10 min-h-[110px]"
                    placeholder="Type quick notes and decisions..."
                    value={note}
                    onChange={(e) =>
                      setNote((e.target as HTMLTextAreaElement).value)
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={addNote}>Add note</Button>
                  <Button className="bg-gray-800" onClick={() => setNotes([])}>
                    Clear
                  </Button>
                </div>

                <div className="pt-2 space-y-3 max-h-[360px] overflow-auto">
                  {notes.length === 0 && (
                    <div className="text-sm text-gray-500">
                      No notes yet. Add your first decision or action item.
                    </div>
                  )}
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="p-3 rounded-xl border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold truncate">{n.topic}</div>
                        <Badge className="bg-gray-100">@ {fmtTime(n.ts)}</Badge>
                      </div>
                      {n.text && (
                        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                          {n.text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Everest comparator */}
          <div className="lg:col-span-1">
            <EverestPanel altitudeM={eqAlt} fractionPercent={o2.percent} />
          </div>
        </div>

        <footer className="mt-8 text-xs text-gray-500">
          <div>
            Tip: Only onsite people affect the room oxygen. Everyone counts
            toward cost.
          </div>
          <div>
            Dead zone shown for fun awareness. Please ventilate your room in
            real life. 😊
          </div>
        </footer>
      </div>
    </div>
  );
}
