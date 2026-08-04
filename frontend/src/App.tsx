import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline } from 'react-leaflet';
import { 
  Activity, AlertTriangle, CheckCircle2, Clock, 
  Terminal, Settings, Zap, RefreshCw, Wrench
} from 'lucide-react';

const API_URL = (import.meta as any).env?.VITE_API_URL ? `${(import.meta as any).env.VITE_API_URL}/api` : 'http://localhost:3000/api';

interface Substation { id: string; name: string; lat: number; lon: number; pincode: string; }
interface Feeder { id: string; substation_id: string; capacity_mw: number; }
interface Transformer { id: string; feeder_id: string; lat: number; lon: number; capacity_kva: number; }
interface Pole { id: string; device_id: string | null; dt_id: string; feeder_id: string; seq_on_line: number; parent_pole_id: string | null; lat: number; lon: number; pincode: string; }
interface Ticket { id: string; type: 'span' | 'dt' | 'feeder'; target_id: string; span_start_pole_id: string | null; span_end_pole_id: string | null; coordinates: string; pincode: string; downstream_poles_count: number; confidence: number; rationale: string; status: 'detected' | 'acknowledged' | 'crew_assigned' | 'resolved' | 'verified' | 'closed'; created_at: string; updated_at: string; }
interface ActiveFault { id: number; type: 'span' | 'dt' | 'feeder'; target_id: string; span_end_pole_id?: string; created_at: string; }
interface ScheduledOutage { id: number; type: 'dt' | 'feeder' | 'pole'; target_id: string; start_time: string; end_time: string; }
interface TelemetryLog { id: number; device_id: string; pole_id: string; event: string; energized: boolean; ts: string; seq: number; battery_mv: number; rssi: number; fw: string; }

export default function App() {
  // State
  const [substations, setSubstations] = useState<Substation[]>([]);
  const [feeders, setFeeders] = useState<Feeder[]>([]);
  const [transformers, setTransformers] = useState<Transformer[]>([]);
  const [poles, setPoles] = useState<Pole[]>([]);
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeFaults, setActiveFaults] = useState<ActiveFault[]>([]);
  const [scheduledOutages, setScheduledOutages] = useState<ScheduledOutage[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryLog[]>([]);
  
  const [activeTab, setActiveTab] = useState<'tickets' | 'simulator' | 'terminal'>('tickets');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Simulator Injection Form State
  const [faultType, setFaultType] = useState<'feeder' | 'dt' | 'span'>('dt');
  const [selectedFeeder, setSelectedFeeder] = useState('');
  const [selectedTransformer, setSelectedTransformer] = useState('');
  const [selectedPoleStart, setSelectedPoleStart] = useState('');
  const [selectedPoleEnd, setSelectedPoleEnd] = useState('');

  // Scheduled Outage Form State
  const [outageType, setOutageType] = useState<'feeder' | 'dt' | 'pole'>('dt');
  const [outageTargetId, setOutageTargetId] = useState('');
  const [outageEndHours, setOutageEndHours] = useState('2');

  // Load static assets once
  useEffect(() => {
    async function loadAssets() {
      try {
        const res = await fetch(`${API_URL}/simulator/assets`);
        const data = await res.json();
        setSubstations(data.substations || []);
        setFeeders(data.feeders || []);
        setTransformers(data.transformers || []);
        setPoles(data.poles || []);
        
        // Pick defaults
        if (data.feeders?.length > 0) setSelectedFeeder(data.feeders[0].id);
        if (data.transformers?.length > 0) {
          setSelectedTransformer(data.transformers[0].id);
          setOutageTargetId(data.transformers[0].id);
        }
        if (data.poles?.length > 0) {
          setSelectedPoleStart(data.poles[0].id);
          setSelectedPoleEnd(data.poles[1]?.id || data.poles[0].id);
        }
        setLoading(false);
      } catch (err) {
        console.error('Error loading static assets:', err);
        setErrorMessage('Failed to connect to backend service. Is the docker container running?');
        setLoading(false);
      }
    }
    loadAssets();
  }, []);

  // Poll state and telemetry every 2 seconds
  useEffect(() => {
    async function fetchState() {
      try {
        setRefreshing(true);
        // 1. Fetch tickets
        const tktRes = await fetch(`${API_URL}/tickets`);
        const tkts = await tktRes.json();
        setTickets(tkts);

        // 2. Fetch simulator state
        const stateRes = await fetch(`${API_URL}/simulator/state`);
        const state = await stateRes.json();
        setActiveFaults(state.active_faults || []);
        setScheduledOutages(state.scheduled_outages || []);

        // 3. Fetch telemetry logs
        const telRes = await fetch(`${API_URL}/telemetry`);
        const telLogs = await telRes.json();
        setTelemetry(telLogs || []);
        
        setErrorMessage(null);
      } catch (err) {
        console.error('Error polling data:', err);
      } finally {
        setRefreshing(false);
      }
    }

    fetchState();
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  }, []);

  // Actions
  const handleInjectFault = async (e: React.FormEvent) => {
    e.preventDefault();
    let target_id = '';
    let span_end_pole_id = undefined;

    if (faultType === 'feeder') target_id = selectedFeeder;
    else if (faultType === 'dt') target_id = selectedTransformer;
    else {
      target_id = selectedPoleStart;
      span_end_pole_id = selectedPoleEnd;
    }

    try {
      const res = await fetch(`${API_URL}/simulator/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: faultType, target_id, span_end_pole_id })
      });
      const data = await res.json();
      if (data.status === 'SUCCESS') {
        alert('Fault successfully injected!');
      } else {
        alert(`Failed to inject fault: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error injecting fault: ${err.message}`);
    }
  };

  const handleClearFault = async (faultId: number) => {
    try {
      const res = await fetch(`${API_URL}/simulator/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fault_id: faultId })
      });
      const data = await res.json();
      if (data.status === 'SUCCESS') {
        alert('Fault cleared successfully! Grid restoring...');
      } else {
        alert(`Failed to clear fault: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleCreateOutage = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = new Date();
    const end = new Date(start.getTime() + parseFloat(outageEndHours) * 60 * 60 * 1000);

    try {
      const res = await fetch(`${API_URL}/simulator/outage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: outageType,
          target_id: outageTargetId,
          start_time: start.toISOString(),
          end_time: end.toISOString()
        })
      });
      const data = await res.json();
      if (data.status === 'SUCCESS') {
        alert('Scheduled maintenance outage registered.');
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, newStatus: string) => {
    try {
      const res = await fetch(`${API_URL}/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      
      if (!res.ok) {
        // G4 rule: manual closure block check
        if (data.error === 'CANNOT_CLOSE_DARK_ASSET') {
          alert(`⚠️ SAFETY PROTOCOL BREACHED:\n${data.message}`);
        } else {
          alert(`Failed to update ticket: ${data.error || 'Unknown error'}`);
        }
      } else {
        alert(`Ticket status updated to ${newStatus}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Optimized lookups: Map of pole by ID and Set of dark device IDs
  const polesMap = React.useMemo(() => {
    const map = new Map<string, Pole>();
    for (const p of poles) {
      map.set(p.id, p);
    }
    return map;
  }, [poles]);

  const darkDevicesSet = React.useMemo(() => {
    const darkSet = new Set<string>();
    const seenDevices = new Set<string>();
    for (const log of telemetry) {
      if (!seenDevices.has(log.device_id)) {
        seenDevices.add(log.device_id);
        if (log.event === 'power_lost') {
          darkSet.add(log.device_id);
        }
      }
    }
    return darkSet;
  }, [telemetry]);

  // Helper: check if a pole is physically dark in the current UI state
  // (Meaning its latest telemetry event is power_lost)
  const isPoleDark = (poleId: string) => {
    const pole = polesMap.get(poleId);
    if (!pole || !pole.device_id) return false;
    return darkDevicesSet.has(pole.device_id);
  };

  // Center coordinate calculation
  const getMapCenter = (): [number, number] => {
    if (substations.length > 0) return [substations[0].lat, substations[0].lon];
    if (poles.length > 0) return [poles[0].lat, poles[0].lon];
    return [12.93, 77.58]; // Default Bangalore center
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#050505] font-mono text-[#e5e2e1]">
        <Activity className="h-10 w-10 animate-spin text-[#c6c6c7] mb-4" />
        <h1 className="text-xl font-bold tracking-widest uppercase">GridGuard Operator Panel</h1>
        <p className="text-xs opacity-50 uppercase mt-1">Downloading grid topology schema...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#050505] font-mono text-[#e5e2e1] select-none">
      {/* Header bar */}
      <header className="flex h-14 items-center justify-between border-b border-[#242424] px-6 bg-[#0a0a0a]">
        <div className="flex items-center space-x-3">
          <img src="/logo.svg" className="h-7 w-7 object-contain animate-pulse" alt="GridGuard Logo" />
          <div className="flex items-center space-x-1.5 font-bold tracking-tighter text-base uppercase">
            <span className="text-white">GridGuard</span>
            <span className="text-zinc-600">|</span>
            <span className="text-orange-500">Propel</span>
          </div>
          <span className="bg-orange-950 text-orange-400 border border-orange-800 text-[9px] px-2 py-0.5 uppercase tracking-widest font-bold rounded">
            Live Ops Console
          </span>
        </div>

        {/* Real-time stats */}
        <div className="hidden md:flex items-center space-x-6 text-[11px] uppercase tracking-wider text-opacity-80">
          <div className="flex items-center space-x-2">
            <span className="opacity-50">Active Tickets:</span>
            <span className="font-bold text-red-500">{tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed').length}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="opacity-50">Active Simulator Faults:</span>
            <span className="font-bold text-orange-400">{activeFaults.length}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="opacity-50">Scheduled Outages:</span>
            <span className="font-bold text-blue-400">{scheduledOutages.length}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="opacity-50">Heartbeat Rate:</span>
            <span className="font-bold text-emerald-500">500 msg/s</span>
          </div>
          <div className="flex items-center space-x-1">
            <RefreshCw className={`h-3.5 w-3.5 text-zinc-400 ${refreshing ? 'animate-spin' : ''}`} />
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Threat Map MapContainer */}
        <section className="flex-1 relative bg-[#0c0c0c] border-r border-[#242424]">
          {errorMessage && (
            <div className="absolute top-4 left-4 right-4 z-[1000] bg-red-950 border border-red-800 text-red-300 p-3 text-xs uppercase flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="absolute top-3 right-3 z-[1000] bg-[#0c0c0c] border border-[#242424] p-3 text-[10px] uppercase space-y-2">
            <div className="font-bold border-b border-[#242424] pb-1 mb-1">LEGEND</div>
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 inline-block rounded-sm bg-blue-500" />
              <span>Substation</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 inline-block rounded-full bg-purple-500" />
              <span>Transformer (DT)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 inline-block rounded-full bg-emerald-500" />
              <span>Pole (Energized)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 inline-block rounded-full bg-red-500 animate-ping" />
              <span>Pole (Power Lost)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 inline-block rounded-full bg-zinc-600" />
              <span>Pole (Offline/No Device)</span>
            </div>
          </div>

          <MapContainer 
            center={getMapCenter()} 
            zoom={14} 
            className="h-full w-full"
            style={{ background: '#050505' }}
            preferCanvas={true}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />

            {/* Render Spans / Feeders */}
            {poles.map(pole => {
              if (pole.parent_pole_id) {
                const parent = polesMap.get(pole.parent_pole_id);
                if (parent) {
                  const isFault = isPoleDark(pole.id) && isPoleDark(parent.id);
                  return (
                    <Polyline
                      key={`span-${parent.id}-${pole.id}`}
                      positions={[[parent.lat, parent.lon], [pole.lat, pole.lon]]}
                      color={isFault ? '#ef4444' : '#10b981'}
                      weight={2}
                      opacity={0.6}
                    />
                  );
                }
              }
              return null;
            })}

            {/* Render Substations */}
            {substations.map(sub => (
              <CircleMarker
                key={sub.id}
                center={[sub.lat, sub.lon]}
                radius={9}
                fillColor="#3b82f6"
                color="#1d4ed8"
                fillOpacity={0.9}
                weight={2}
              >
                <Popup>
                  <div className="text-xs font-mono uppercase bg-zinc-950 text-white p-1">
                    <div className="font-bold">{sub.name}</div>
                    <div>ID: {sub.id}</div>
                    <div>Pincode: {sub.pincode}</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Render Transformers */}
            {transformers.map(dt => (
              <CircleMarker
                key={dt.id}
                center={[dt.lat, dt.lon]}
                radius={7}
                fillColor="#a855f7"
                color="#7e22ce"
                fillOpacity={0.9}
                weight={2}
              >
                <Popup>
                  <div className="text-xs font-mono uppercase bg-zinc-950 text-white p-1">
                    <div className="font-bold">Transformer</div>
                    <div>ID: {dt.id}</div>
                    <div>Feeder ID: {dt.feeder_id}</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Render Poles */}
            {poles.map(pole => {
              const isDark = isPoleDark(pole.id);
              let color = '#10b981'; // energized
              if (!pole.device_id) color = '#52525b'; // un-monitored
              else if (isDark) color = '#ef4444'; // power lost

              return (
                <CircleMarker
                  key={pole.id}
                  center={[pole.lat, pole.lon]}
                  radius={4}
                  fillColor={color}
                  color={isDark ? '#b91c1c' : '#047857'}
                  fillOpacity={0.95}
                  weight={1}
                >
                  <Popup>
                    <div className="text-xs font-mono uppercase bg-zinc-950 text-white p-1">
                      <div className="font-bold">Pole ID: {pole.id}</div>
                      <div>Device ID: {pole.device_id || 'N/A (un-monitored)'}</div>
                      <div>DT ID: {pole.dt_id}</div>
                      <div>Status: {isDark ? 'POWER_LOST' : pole.device_id ? 'ENERGIZED' : 'UNMONITORED'}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </section>

        {/* Right Side: Operational Tabs Panel */}
        <aside className="w-[450px] flex flex-col bg-[#0a0a0a] border-l border-[#242424]">
          {/* Tabs header */}
          <div className="flex border-b border-[#242424] text-xs">
            <button
              onClick={() => setActiveTab('tickets')}
              className={`flex-1 py-3 text-center uppercase tracking-wider font-bold border-r border-[#242424] flex items-center justify-center space-x-1.5 ${
                activeTab === 'tickets' ? 'bg-[#0f0f0f] text-white border-b-2 border-b-red-500' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Fault Tickets ({tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed').length})</span>
            </button>
            <button
              onClick={() => setActiveTab('simulator')}
              className={`flex-1 py-3 text-center uppercase tracking-wider font-bold border-r border-[#242424] flex items-center justify-center space-x-1.5 ${
                activeTab === 'simulator' ? 'bg-[#0f0f0f] text-white border-b-2 border-b-orange-500' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Simulator</span>
            </button>
            <button
              onClick={() => setActiveTab('terminal')}
              className={`flex-1 py-3 text-center uppercase tracking-wider font-bold flex items-center justify-center space-x-1.5 ${
                activeTab === 'terminal' ? 'bg-[#0f0f0f] text-white border-b-2 border-b-emerald-500' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Terminal</span>
            </button>
          </div>

          {/* Tab Contents */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* 1. TICKETS TAB */}
            {activeTab === 'tickets' && (
              <div className="space-y-3">
                {tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed' && t.status !== 'verified').length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 uppercase text-xs space-y-2">
                    <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-700" />
                    <div>All network systems normal.</div>
                    <div>No active localized faults.</div>
                  </div>
                ) : (
                  tickets
                    .filter(t => t.status !== 'resolved' && t.status !== 'closed' && t.status !== 'verified')
                    .map(tkt => (
                      <div key={tkt.id} className="border border-red-950 bg-red-950 bg-opacity-20 p-4 space-y-3 relative">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] bg-red-950 text-red-400 border border-red-800 px-1.5 py-0.5 font-bold uppercase tracking-wider">
                              {tkt.type} OUTAGE
                            </span>
                            <h3 className="font-bold text-sm text-red-200 mt-1.5">{tkt.id}</h3>
                          </div>
                          <span className="text-xs text-orange-400 font-bold bg-orange-950 bg-opacity-40 border border-orange-900 px-2 py-0.5">
                            {tkt.confidence}% CONF
                          </span>
                        </div>

                        <div className="text-[11px] text-zinc-400 space-y-1">
                          <div><strong className="text-zinc-300">Target Asset:</strong> {tkt.target_id}</div>
                          <div><strong className="text-zinc-300">Coordinates:</strong> {tkt.coordinates}</div>
                          <div><strong className="text-zinc-300">Pincode Area:</strong> {tkt.pincode}</div>
                          <div><strong className="text-zinc-300">Downstream Poles:</strong> {tkt.downstream_poles_count} poles dark</div>
                          {tkt.span_start_pole_id && (
                            <div><strong className="text-zinc-300">Span Boundary:</strong> {tkt.span_start_pole_id} ➔ {tkt.span_end_pole_id}</div>
                          )}
                        </div>

                        {/* Natural Language Rationale (AI Dispatcher Brief) */}
                        <div className="bg-black bg-opacity-65 p-2 text-[10.5px] border border-zinc-800 text-zinc-300 leading-relaxed font-mono">
                          <span className="text-orange-500 font-bold block mb-1 text-[9px] uppercase tracking-wider">AI Localization Rationale:</span>
                          {tkt.rationale}
                        </div>

                        {/* Ticket State Controller */}
                        <div className="flex flex-wrap gap-2 pt-1.5 border-t border-red-950 text-[10px]">
                          {tkt.status === 'detected' && (
                            <button
                              onClick={() => handleUpdateTicketStatus(tkt.id, 'acknowledged')}
                              className="px-2.5 py-1 bg-red-900 hover:bg-red-800 text-white font-bold uppercase"
                            >
                              Acknowledge
                            </button>
                          )}
                          {(tkt.status === 'detected' || tkt.status === 'acknowledged') && (
                            <button
                              onClick={() => handleUpdateTicketStatus(tkt.id, 'crew_assigned')}
                              className="px-2.5 py-1 bg-orange-900 hover:bg-orange-800 text-white font-bold uppercase flex items-center space-x-1"
                            >
                              <Wrench className="h-3 w-3" />
                              <span>Assign Crew</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleUpdateTicketStatus(tkt.id, 'resolved')}
                            className="px-2.5 py-1 bg-emerald-900 hover:bg-emerald-800 text-white font-bold uppercase"
                          >
                            Resolve Outage
                          </button>
                          <span className="ml-auto text-[9px] text-zinc-500 flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{new Date(tkt.created_at).toLocaleTimeString()}</span>
                          </span>
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}

            {/* 2. SIMULATOR PANEL TAB */}
            {activeTab === 'simulator' && (
              <div className="space-y-4 text-xs">
                
                {/* Outage injector */}
                <form onSubmit={handleInjectFault} className="border border-zinc-800 bg-[#0f0f0f] p-4 space-y-3">
                  <div className="font-bold text-orange-400 border-b border-zinc-800 pb-1 mb-2 uppercase tracking-wide flex items-center space-x-1.5">
                    <Zap className="h-4 w-4" />
                    <span>Fault Seeding Engine</span>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-zinc-400 text-[10px] uppercase">Fault Location Level</label>
                    <select
                      value={faultType}
                      onChange={(e) => setFaultType(e.target.value as any)}
                      className="w-full bg-[#050505] border border-zinc-800 text-white p-2 text-xs focus:outline-none"
                    >
                      <option value="feeder">Feeder Breaker Trip (Feeder Level)</option>
                      <option value="dt">Transformer Burnout (DT Level)</option>
                      <option value="span">Conductor Snap (Span Level)</option>
                    </select>
                  </div>

                  {/* Level dropdowns */}
                  {faultType === 'feeder' && (
                    <div className="space-y-1">
                      <label className="block text-zinc-400 text-[10px] uppercase">Target Feeder</label>
                      <select
                        value={selectedFeeder}
                        onChange={(e) => setSelectedFeeder(e.target.value)}
                        className="w-full bg-[#050505] border border-zinc-800 text-white p-2 text-xs"
                      >
                        {feeders.map(f => (
                          <option key={f.id} value={f.id}>{f.id} (Cap: {f.capacity_mw}MW)</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {faultType === 'dt' && (
                    <div className="space-y-1">
                      <label className="block text-zinc-400 text-[10px] uppercase">Target Transformer</label>
                      <select
                        value={selectedTransformer}
                        onChange={(e) => setSelectedTransformer(e.target.value)}
                        className="w-full bg-[#050505] border border-zinc-800 text-white p-2 text-xs"
                      >
                        {transformers.map(t => (
                          <option key={t.id} value={t.id}>{t.id} (Feeder: {t.feeder_id})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {faultType === 'span' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="block text-zinc-400 text-[10px] uppercase">Start Pole</label>
                        <select
                          value={selectedPoleStart}
                          onChange={(e) => setSelectedPoleStart(e.target.value)}
                          className="w-full bg-[#050505] border border-zinc-800 text-white p-2 text-xs"
                        >
                          {poles.filter(p => p.device_id !== null).map(p => (
                            <option key={p.id} value={p.id}>{p.id}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-zinc-400 text-[10px] uppercase">End Pole (Child)</label>
                        <select
                          value={selectedPoleEnd}
                          onChange={(e) => setSelectedPoleEnd(e.target.value)}
                          className="w-full bg-[#050505] border border-zinc-800 text-white p-2 text-xs"
                        >
                          {poles.filter(p => p.device_id !== null).map(p => (
                            <option key={p.id} value={p.id}>{p.id}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-orange-700 hover:bg-orange-600 text-white font-bold uppercase py-2 text-xs"
                  >
                    Inject Fault Payload
                  </button>
                </form>

                {/* Scheduled Outages Form */}
                <form onSubmit={handleCreateOutage} className="border border-zinc-800 bg-[#0f0f0f] p-4 space-y-3">
                  <div className="font-bold text-blue-400 border-b border-zinc-800 pb-1 mb-2 uppercase tracking-wide flex items-center space-x-1.5">
                    <Clock className="h-4 w-4" />
                    <span>Outage Maintenance Scheduler</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block text-zinc-400 text-[10px] uppercase">Type</label>
                      <select
                        value={outageType}
                        onChange={(e) => setOutageType(e.target.value as any)}
                        className="w-full bg-[#050505] border border-zinc-800 text-white p-2 text-xs"
                      >
                        <option value="dt">Transformer</option>
                        <option value="feeder">Feeder</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-zinc-400 text-[10px] uppercase">Target ID</label>
                      <input
                        type="text"
                        value={outageTargetId}
                        onChange={(e) => setOutageTargetId(e.target.value)}
                        className="w-full bg-[#050505] border border-zinc-800 text-white p-1.5 text-xs focus:outline-none"
                        placeholder="DT-0005"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-zinc-400 text-[10px] uppercase">Duration (Hours from now)</label>
                    <select
                      value={outageEndHours}
                      onChange={(e) => setOutageEndHours(e.target.value)}
                      className="w-full bg-[#050505] border border-zinc-800 text-white p-2 text-xs"
                    >
                      <option value="1">1 Hour</option>
                      <option value="2">2 Hours</option>
                      <option value="4">4 Hours</option>
                      <option value="8">8 Hours</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-800 hover:bg-blue-700 text-white font-bold uppercase py-2 text-xs"
                  >
                    Schedule Outage window
                  </button>
                </form>

                {/* Active Faults List */}
                <div className="border border-zinc-800 bg-[#0f0f0f] p-4 space-y-2">
                  <div className="font-bold border-b border-zinc-800 pb-1 text-zinc-400 uppercase">
                    Active Faults Grid ({activeFaults.length})
                  </div>
                  {activeFaults.length === 0 ? (
                    <div className="text-zinc-600 italic py-2">No active simulation faults.</div>
                  ) : (
                    <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                      {activeFaults.map(fault => (
                        <div key={fault.id} className="bg-zinc-950 p-2 border border-zinc-900 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-orange-400 uppercase">[{fault.type}]</span>
                            <span className="ml-1.5 text-zinc-300 font-bold">{fault.target_id}</span>
                            {fault.span_end_pole_id && <span className="text-[10px] text-zinc-500"> ➔ {fault.span_end_pole_id}</span>}
                          </div>
                          <button
                            onClick={() => handleClearFault(fault.id)}
                            className="bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800 px-2 py-0.5 text-[10px] uppercase font-bold"
                          >
                            Repair/Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. SCROLLING TERMINAL TAB */}
            {activeTab === 'terminal' && (
              <div className="bg-[#050505] border border-zinc-800 p-3 h-[450px] flex flex-col font-mono text-[10px]">
                <div className="text-emerald-500 font-bold border-b border-zinc-900 pb-1.5 mb-2 flex items-center justify-between">
                  <span>TELEMETRY UPLINK STREAM</span>
                  <span className="animate-pulse bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded text-[8px]">ONLINE</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-thin select-text">
                  {telemetry.length === 0 ? (
                    <div className="text-zinc-700 italic">Awaiting grid sensor broadcasts...</div>
                  ) : (
                    telemetry.map((log, index) => {
                      let eventColor = 'text-emerald-500';
                      if (log.event === 'power_lost') eventColor = 'text-red-500 font-bold animate-pulse';
                      else if (log.event === 'boot') eventColor = 'text-cyan-400 font-bold';

                      return (
                        <div key={index} className="text-zinc-400 leading-tight">
                          <span className="text-zinc-600">[{new Date(log.ts).toLocaleTimeString()}]</span>{' '}
                          <span className="text-zinc-300 font-bold">{log.device_id}</span>{' '}
                          <span className={eventColor}>{log.event.toUpperCase()}</span>{' '}
                          <span className="text-zinc-500">Seq:{log.seq} Battery:{log.battery_mv}mV Rssi:{log.rssi}dBm Fw:{log.fw}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

          </div>
        </aside>
      </div>
    </div>
  );
}
