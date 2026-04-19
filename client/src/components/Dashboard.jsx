import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import API from '../config';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Loader2,
  RefreshCw,
  AlertCircle,
  Plus,
  X,
  Settings2,
  Check,
  BarChart2,
  TrendingUp,
  PieChart,
  ScanSearch,
  Sparkles,
  Database,
  ChevronUp,
  ChevronDown,
  FileBarChart2,
  Rows3,
  Columns3,
  Activity,
} from 'lucide-react';
import ChartDisplay from './ChartDisplay';
import { InsightsPanel } from './KPICard';

const CHART_TYPES = [
  { id: 'bar', label: 'Bar', icon: BarChart2 },
  { id: 'line', label: 'Line', icon: TrendingUp },
  { id: 'area', label: 'Area', icon: TrendingUp },
  { id: 'pie', label: 'Pie', icon: PieChart },
  { id: 'donut', label: 'Donut', icon: PieChart },
  { id: 'scatter', label: 'Scatter', icon: ScanSearch },
];

const EditDrawer = ({ draft, setDraft, columns, numCols, onApply, onCancel, rebuilding }) => (
  <motion.div
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: 'auto' }}
    exit={{ opacity: 0, height: 0 }}
    className="overflow-hidden border-t border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40"
  >
    <div className="space-y-4 p-4">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">Chart Type</p>
        <div className="flex flex-wrap gap-2">
          {CHART_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setDraft((value) => ({ ...value, chart_type: type.id }))}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                draft.chart_type === type.id
                  ? 'border-indigo-500 bg-indigo-500 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              <type.icon size={13} />
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">X Axis</p>
          <select
            value={draft.x_key}
            onChange={(e) => setDraft((value) => ({ ...value, x_key: e.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">Y Axis</p>
          <select
            value={draft.y_key}
            onChange={(e) => setDraft((value) => ({ ...value, y_key: e.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {numCols.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onApply}
          disabled={rebuilding}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
        >
          {rebuilding ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {rebuilding ? 'Applying...' : 'Apply Changes'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          Cancel
        </button>
      </div>
    </div>
  </motion.div>
);

const ChartPanel = ({ panel, index, total, columns, numCols, fileId, onRemove, onMoveUp, onMoveDown, onUpdate }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ chart_type: panel.chart_type, x_key: panel.x_key, y_key: panel.y_key });
  const [rebuilding, setRebuilding] = useState(false);

  const applyChanges = async () => {
    setRebuilding(true);
    try {
      const res = await axios.post(`${API}/dashboard/chart`, {
        file_id: fileId,
        chart_type: draft.chart_type,
        x_col: draft.x_key,
        y_col: draft.y_key,
      });
      if (res.data.success) {
        onUpdate(index, {
          ...panel,
          chart_type: draft.chart_type,
          x_key: draft.x_key,
          y_key: draft.y_key,
          data: res.data.data,
          title: `${draft.x_key} x ${draft.y_key}`,
        });
        setEditing(false);
      }
    } catch (e) {
      console.error('Chart rebuild failed', e);
    } finally {
      setRebuilding(false);
    }
  };

  const chartTypeLabel = CHART_TYPES.find((item) => item.id === panel.chart_type)?.label || panel.chart_type;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22 }}
      className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/95 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/70 px-5 py-4 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
              <FileBarChart2 size={17} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                {panel.title || `${panel.x_key} x ${panel.y_key}`}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {chartTypeLabel} chart • {panel.x_key} vs {panel.y_key}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <IconButton title="Move up" disabled={index === 0} onClick={() => onMoveUp(index)}>
            <ChevronUp size={14} />
          </IconButton>
          <IconButton title="Move down" disabled={index === total - 1} onClick={() => onMoveDown(index)}>
            <ChevronDown size={14} />
          </IconButton>
          <IconButton
            title="Edit chart"
            active={editing}
            onClick={() => {
              setDraft({ chart_type: panel.chart_type, x_key: panel.x_key, y_key: panel.y_key });
              setEditing((value) => !value);
            }}
          >
            <Settings2 size={14} />
          </IconButton>
          <IconButton title="Remove chart" danger onClick={() => onRemove(index)}>
            <X size={14} />
          </IconButton>
        </div>
      </div>

      <AnimatePresence>
        {editing && (
          <EditDrawer
            draft={draft}
            setDraft={setDraft}
            columns={columns}
            numCols={numCols}
            onApply={applyChanges}
            onCancel={() => setEditing(false)}
            rebuilding={rebuilding}
          />
        )}
      </AnimatePresence>

      <div className="p-4">
        <ChartDisplay
          chartType={panel.chart_type}
          data={panel.data}
          xKey={panel.x_key}
          yKey={panel.y_key}
          insights={[]}
          reasoning=""
          customColor={null}
          compact={true}
        />
      </div>
    </motion.div>
  );
};

const AddPanelDrawer = ({ columns, numCols, catCols, fileId, onAdd, onClose }) => {
  const [chartType, setChartType] = useState('bar');
  const [xCol, setXCol] = useState(catCols[0] || columns[0] || '');
  const [yCol, setYCol] = useState(numCols[0] || '');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!xCol || !yCol) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/dashboard/chart`, {
        file_id: fileId,
        chart_type: chartType,
        x_col: xCol,
        y_col: yCol,
      });
      if (res.data.success) {
        onAdd({
          chart_type: chartType,
          x_key: xCol,
          y_key: yCol,
          data: res.data.data,
          title: `${xCol} x ${yCol}`,
        });
      }
    } catch (e) {
      console.error('Add panel failed', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-teal-500 dark:text-slate-950">
            <Plus size={16} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Add Chart</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Create another dashboard panel</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">Chart Type</p>
          <div className="grid grid-cols-3 gap-2">
            {CHART_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => setChartType(type.id)}
                className={`rounded-2xl border p-3 text-center transition ${
                  chartType === type.id
                    ? 'border-indigo-500 bg-indigo-500 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                <type.icon size={16} className="mx-auto" />
                <span className="mt-2 block text-[11px] font-semibold">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">X Axis</p>
          <select
            value={xCol}
            onChange={(e) => setXCol(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">Y Axis</p>
          <select
            value={yCol}
            onChange={(e) => setYCol(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {numCols.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </div>

        {xCol && yCol && (
          <div className="rounded-[1.5rem] border border-teal-200 bg-teal-50 p-4 dark:border-teal-900/40 dark:bg-teal-950/30">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-700 dark:text-teal-300">Preview</p>
            <p className="mt-2 text-sm font-bold text-teal-950 dark:text-teal-100">
              {xCol} x {yCol}
            </p>
            <p className="mt-1 text-xs text-teal-800 dark:text-teal-300">{chartType} chart</p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 p-6 dark:border-slate-800">
        <button
          onClick={handleAdd}
          disabled={loading || !xCol || !yCol}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          {loading ? 'Building chart...' : 'Add to Dashboard'}
        </button>
      </div>
    </motion.div>
  );
};

const StatTile = ({ icon: Icon, label, value, accent }) => (
  <div className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${accent}`}>
      <Icon size={16} />
    </div>
    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">{value}</p>
  </div>
);

const IconButton = ({ children, onClick, title, disabled, active, danger }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`rounded-xl p-2 transition ${
      disabled
        ? 'cursor-not-allowed text-slate-300'
        : danger
          ? 'text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40'
          : active
            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200'
    }`}
  >
    {children}
  </button>
);

const Dashboard = ({ currentFile }) => {
  const [meta, setMeta] = useState(null);
  const [panels, setPanels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddDrawer, setShowAddDrawer] = useState(false);

  const loadDashboard = async () => {
    if (!currentFile?.file_id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API}/dashboard/${currentFile.file_id}`);
      const data = res.data;
      setMeta({
        columns: data.columns || [],
        numCols: data.num_cols || [],
        catCols: data.cat_cols || [],
        insights: data.insights || [],
        summary: data.summary || '',
      });
      setPanels(data.dashboard_charts || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [currentFile?.file_id]);

  const handleRemove = useCallback((idx) => setPanels((items) => items.filter((_, i) => i !== idx)), []);
  const handleMoveUp = useCallback((idx) => {
    if (idx === 0) return;
    setPanels((items) => {
      const next = [...items];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);
  const handleMoveDown = useCallback((idx) => {
    setPanels((items) => {
      if (idx === items.length - 1) return items;
      const next = [...items];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);
  const handleUpdate = useCallback((idx, updated) => {
    setPanels((items) => items.map((panel, i) => (i === idx ? updated : panel)));
  }, []);
  const handleAdd = useCallback((newPanel) => {
    setPanels((items) => [...items, newPanel]);
    setShowAddDrawer(false);
  }, []);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-[2rem] bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
          <LayoutDashboard size={30} />
          <Loader2 size={18} className="absolute -bottom-1 -right-1 animate-spin text-slate-900 dark:text-white" />
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-slate-900 dark:text-white">Building dashboard</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Analyzing your dataset and arranging chart panels.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-red-100 text-red-500 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle size={26} />
        </div>
        <div>
          <p className="text-base font-bold text-slate-900 dark:text-white">Failed to load dashboard</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error}</p>
        </div>
        <button
          onClick={loadDashboard}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
        >
          <RefreshCw size={14} />
          Try Again
        </button>
      </div>
    );
  }

  if (!meta) return null;

  return (
    <div className="min-h-full p-4 lg:p-6">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-[linear-gradient(135deg,rgba(79,70,229,0.10),rgba(255,255,255,0.88)_42%,rgba(20,184,166,0.08))] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-[linear-gradient(135deg,rgba(79,70,229,0.14),rgba(15,23,42,0.9)_45%,rgba(20,184,166,0.1))] lg:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-indigo-800 dark:border-indigo-900/50 dark:bg-slate-900/70 dark:text-indigo-300">
                <LayoutDashboard size={14} />
                Dashboard overview
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-white lg:text-4xl">
                {currentFile.filename}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                A cleaner analytics layout with quick dataset context, focused insights, and editable chart cards arranged for comparison.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={loadDashboard}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-teal-500 dark:hover:text-teal-300"
              >
                <RefreshCw size={15} />
                Reset layout
              </button>
              <button
                onClick={() => setShowAddDrawer(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
              >
                <Plus size={16} />
                Add Chart
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile icon={Rows3} label="Rows" value={(currentFile.stats?.rows ?? 0).toLocaleString()} accent="bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300" />
            <StatTile icon={Columns3} label="Columns" value={meta.columns.length} accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" />
            <StatTile icon={BarChart2} label="Charts" value={panels.length} accent="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" />
            <StatTile icon={Activity} label="Insights" value={meta.insights.length} accent="bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_360px]">
          <div className="space-y-6">
            {panels.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/75 p-10 text-center shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-600">
                  <LayoutDashboard size={30} />
                </div>
                <p className="mt-5 text-lg font-bold text-slate-900 dark:text-white">No charts yet</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-slate-500 dark:text-slate-400">
                  Start with a recommended chart panel and build a clearer dashboard story from your dataset.
                </p>
                <button
                  onClick={() => setShowAddDrawer(true)}
                  className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
                >
                  <Plus size={15} />
                  Add First Chart
                </button>
              </div>
            ) : (
              <div className="grid gap-5 2xl:grid-cols-2">
                <AnimatePresence>
                  {panels.map((panel, idx) => (
                    <ChartPanel
                      key={`${panel.x_key}-${panel.y_key}-${idx}`}
                      panel={panel}
                      index={idx}
                      total={panels.length}
                      columns={meta.columns}
                      numCols={meta.numCols}
                      fileId={currentFile.file_id}
                      onRemove={handleRemove}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                      onUpdate={handleUpdate}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Executive Summary</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">What matters most in this dataset</p>
                </div>
              </div>

              <div className="mt-4 rounded-[1.5rem] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                  {meta.summary || 'Generate more charts or ask the chat assistant to uncover patterns, anomalies, and next-step recommendations.'}
                </p>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <Database size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Dataset context</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Structure behind the dashboard</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <ContextRow label="Numeric columns" value={meta.numCols.length} />
                <ContextRow label="Category columns" value={meta.catCols.length} />
                <ContextRow label="Total columns" value={meta.columns.length} />
                <ContextRow label="Quality score" value={`${currentFile.score ?? 0}%`} />
              </div>
            </div>

            {meta.insights.length > 0 && (
              <div className="rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
                <InsightsPanel insights={meta.insights} />
              </div>
            )}
          </aside>
        </section>
      </div>

      <AnimatePresence>
        {showAddDrawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddDrawer(false)}
              className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm"
            />
            <AddPanelDrawer
              columns={meta.columns}
              numCols={meta.numCols}
              catCols={meta.catCols}
              fileId={currentFile.file_id}
              onAdd={handleAdd}
              onClose={() => setShowAddDrawer(false)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const ContextRow = ({ label, value }) => (
  <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
    <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
    <span className="text-sm font-bold text-slate-900 dark:text-white">{value}</span>
  </div>
);

export default Dashboard;
