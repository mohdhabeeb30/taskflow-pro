import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api, ApiError, type Board, type DateChange, type SuggestedDependency, type SuggestionResult, type Status, type Task, type TaskInput, type User } from './api.js';

const columns: Array<{ status: Status; label: string; accent: string }> = [
  { status: 'backlog', label: 'Backlog', accent: 'sand' },
  { status: 'in_progress', label: 'In Progress', accent: 'blue' },
  { status: 'review', label: 'Review', accent: 'amber' },
  { status: 'done', label: 'Done', accent: 'green' },
];
const statusLabels: Record<Status, string> = Object.fromEntries(columns.map((column) => [column.status, column.label])) as Record<Status, string>;
const emptyBoard: Board = { tasks: [], dependencies: [] };
const blankTask: TaskInput = { title: '', description: '', status: 'backlog', start_date: '', end_date: '' };

function taskInput(task: Task): TaskInput {
  return { title: task.title, description: task.description, status: task.status, start_date: task.start_date, end_date: task.end_date };
}

function statusFromId(id: string): Status | undefined {
  return columns.some((column) => column.status === id) ? id as Status : undefined;
}

function targetStatus(board: Board, id: string): Status | undefined {
  return statusFromId(id) ?? board.tasks.find((task) => task.id === id)?.status;
}

function rebalance(board: Board, taskId: string, status: Status, targetIndex: number): Board {
  const moved = board.tasks.find((task) => task.id === taskId);
  if (!moved) return board;
  const remaining = board.tasks.filter((task) => task.id !== taskId);
  const destination = remaining.filter((task) => task.status === status);
  const index = Math.max(0, Math.min(targetIndex, destination.length));
  destination.splice(index, 0, { ...moved, status });
  const ordered = columns.flatMap((column) => {
    const tasks = column.status === status ? destination : remaining.filter((task) => task.status === column.status);
    return tasks.map((task, position) => ({ ...task, position }));
  });
  return { ...board, tasks: ordered };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

function derivedBoard(board: Board): Board {
  const tasks = new Map(board.tasks.map((task) => [task.id, task]));
  const blocked = new Map<string, boolean>();
  const blockers = new Map<string, string[]>();
  const check = (taskId: string, visiting = new Set<string>()): boolean => {
    if (blocked.has(taskId)) return blocked.get(taskId)!;
    if (visiting.has(taskId)) return false;
    const nextVisiting = new Set(visiting).add(taskId);
    const directBlockers = board.dependencies.filter((dependency) => dependency.taskId === taskId)
      .filter((dependency) => tasks.get(dependency.dependsOnId)?.status !== 'done')
      .map((dependency) => dependency.dependsOnId);
    const isBlocked = directBlockers.length > 0 || board.dependencies
      .filter((dependency) => dependency.taskId === taskId)
      .some((dependency) => check(dependency.dependsOnId, nextVisiting));
    blocked.set(taskId, isBlocked);
    blockers.set(taskId, directBlockers);
    return isBlocked;
  };
  const nextTasks = board.tasks.map((task) => {
    check(task.id);
    return { ...task, blocked: blocked.get(task.id) ?? false, ready: !(blocked.get(task.id) ?? false), blockers: blockers.get(task.id) ?? [] };
  });
  return { ...board, tasks: nextTasks };
}

function graphRelations(board: Board, taskId: string): { upstream: Set<string>; downstream: Set<string> } {
  const upstream = new Set<string>();
  const downstream = new Set<string>();
  const visit = (direction: 'upstream' | 'downstream') => {
    const seen = direction === 'upstream' ? upstream : downstream;
    const queue = [taskId];
    while (queue.length) {
      const current = queue.shift()!;
      const next = direction === 'upstream'
        ? board.dependencies.filter((dependency) => dependency.taskId === current).map((dependency) => dependency.dependsOnId)
        : board.dependencies.filter((dependency) => dependency.dependsOnId === current).map((dependency) => dependency.taskId);
      next.forEach((id) => { if (!seen.has(id)) { seen.add(id); queue.push(id); } });
    }
  };
  visit('upstream');
  visit('downstream');
  return { upstream, downstream };
}

function formatError(error: unknown, board: Board): string {
  if (error instanceof ApiError && error.code === 'CYCLE_DETECTED' && Array.isArray(error.details?.path)) {
    const path = error.details.path.map((id) => board.tasks.find((task) => task.id === id)?.title ?? String(id));
    return `${error.message}: ${path.join(' → ')}`;
  }
  return errorMessage(error);
}

export function App() {
  const [auth, setAuth] = useState<'checking' | 'anonymous' | 'authenticated'>('checking');
  const [user, setUser] = useState<User>();
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [pageError, setPageError] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3600);
  };

  const handleUnauthorized = () => {
    setAuth('anonymous');
    setUser(undefined);
    setPageError('Your session ended. Please log in again.');
  };

  useEffect(() => {
    api.me()
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        setAuth('authenticated');
        return api.board();
      })
      .then((nextBoard) => setBoard(derivedBoard(nextBoard)))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) setAuth('anonymous');
        else {
          setAuth('anonymous');
          setPageError(errorMessage(error));
        }
      });
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const result = await api.login(email, password);
      setUser(result.user);
      setBoard(derivedBoard(await api.board()));
      setPageError('');
      setAuth('authenticated');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw new Error('Invalid email or password');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) showToast(errorMessage(error));
    }
    setAuth('anonymous');
    setUser(undefined);
    setBoard(emptyBoard);
  };

  if (auth === 'checking') return <div className="screen-state">Loading your workspace...</div>;
  if (auth === 'anonymous') return <LoginScreen onLogin={login} error={pageError} />;

  return (
    <BoardApp
      board={board}
      user={user!}
      toast={toast}
      pageError={pageError}
      setBoard={setBoard}
      onLogout={logout}
      onUnauthorized={handleUnauthorized}
      showToast={showToast}
    />
  );
}

function LoginScreen({ onLogin, error }: { onLogin: (email: string, password: string) => Promise<void>; error: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(error);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await onLogin(email, password);
    } catch (loginError) {
      setMessage(errorMessage(loginError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand-mark">TF</div>
        <p className="eyebrow">TaskFlow Pro</p>
        <h1 id="login-title">Return to the work.</h1>
        <p className="login-copy">Sign in to manage dependencies, dates, and delivery.</p>
        <form onSubmit={submit} className="login-form">
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {message && <p className="form-error" role="alert">{message}</p>}
          <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  );
}

function BoardApp({ board, user, toast, pageError, setBoard, onLogout, onUnauthorized, showToast }: {
  board: Board;
  user: User;
  toast: string;
  pageError: string;
  setBoard: (board: Board) => void;
  onLogout: () => Promise<void>;
  onUnauthorized: () => void;
  showToast: (message: string) => void;
}) {
  const [modal, setModal] = useState<{ task?: Task; open: boolean }>({ open: false });
  const [activeTask, setActiveTask] = useState<Task>();
  const [hoveredTaskId, setHoveredTaskId] = useState<string>();
  const [dateHighlights, setDateHighlights] = useState<Record<string, DateChange & { oldStartDate: string; oldEndDate: string }>>({});
  const [aiProvider, setAiProvider] = useState<'gemini' | 'mock'>();
  const dragSnapshot = useRef<Board | undefined>(undefined);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    api.aiStatus().then(({ provider }) => setAiProvider(provider)).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) onUnauthorized();
    });
  }, []);

  const highlightDateChanges = (before: Board, changes: DateChange[]) => {
    const highlights = Object.fromEntries(changes.flatMap((change) => {
      const oldTask = before.tasks.find((task) => task.id === change.taskId);
      return oldTask && (oldTask.start_date !== change.startDate || oldTask.end_date !== change.endDate)
        ? [[change.taskId, { ...change, oldStartDate: oldTask.start_date, oldEndDate: oldTask.end_date }]]
        : [];
    }));
    if (!Object.keys(highlights).length) return;
    setDateHighlights((current) => ({ ...current, ...highlights }));
    window.setTimeout(() => setDateHighlights((current) => {
      const next = { ...current };
      Object.keys(highlights).forEach((id) => delete next[id]);
      return next;
    }), 4200);
  };

  const guarded = async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onUnauthorized();
      else showToast(formatError(error, board));
    }
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    dragSnapshot.current = board;
    setActiveTask(board.tasks.find((task) => task.id === active.id));
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const nextStatus = targetStatus(board, String(over.id));
    const current = board.tasks.find((task) => task.id === active.id);
    if (!nextStatus || !current || current.status === nextStatus) return;
    const destination = board.tasks.filter((task) => task.status === nextStatus);
    setBoard(derivedBoard(rebalance(board, String(active.id), nextStatus, destination.length)));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTask(undefined);
    if (!over || !dragSnapshot.current) return;
    const id = String(active.id);
    const snapshot = dragSnapshot.current;
    const nextStatus = targetStatus(board, String(over.id));
    if (!nextStatus) return;
    const targetTasks = board.tasks.filter((task) => task.status === nextStatus && task.id !== id);
    const overTaskIndex = targetTasks.findIndex((task) => task.id === over.id);
    const position = overTaskIndex >= 0 ? overTaskIndex : targetTasks.length;
    const optimistic = derivedBoard(rebalance(board, id, nextStatus, position));
    setBoard(optimistic);
    guarded(async () => {
      try {
        await api.moveTask(id, nextStatus, position);
      } catch (error) {
        if (snapshot) setBoard(snapshot);
        throw error;
      }
    }).catch(() => undefined);
    dragSnapshot.current = undefined;
  };

  const saveTask = async (input: TaskInput, task: Task | undefined, prerequisiteId: string | undefined, previousPrerequisiteId: string | undefined) => {
    await guarded(async () => {
      let nextBoard = board;
      let savedTask = task;
      if (task) {
        const result = await api.updateTask(task.id, input);
        savedTask = result.task;
        const changes = [...(result.moved ?? [])];
        if (task.start_date !== result.task.start_date || task.end_date !== result.task.end_date) {
          changes.unshift({ taskId: task.id, startDate: result.task.start_date, endDate: result.task.end_date });
        }
        highlightDateChanges(board, changes);
        nextBoard = derivedBoard({ ...board, tasks: board.tasks.map((item) => {
          const change = changes.find((candidate) => candidate.taskId === item.id);
          const nextTask = item.id === task.id ? { ...item, ...result.task } : item;
          return change ? { ...nextTask, start_date: change.startDate, end_date: change.endDate } : nextTask;
        }) });
      } else {
        const result = await api.createTask(input);
        savedTask = result.task;
        nextBoard = derivedBoard({ ...board, tasks: [...board.tasks, result.task] });
      }
      if (savedTask && prerequisiteId && prerequisiteId !== previousPrerequisiteId) {
        const result = await api.addDependency(savedTask.id, prerequisiteId);
        highlightDateChanges(nextBoard, result.moved);
        nextBoard = derivedBoard({ ...nextBoard, dependencies: [...nextBoard.dependencies, result.dependency], tasks: nextBoard.tasks.map((item) => {
          const change = result.moved.find((moved) => moved.taskId === item.id);
          return change ? { ...item, start_date: change.startDate, end_date: change.endDate } : item;
        }) });
      }
      if (savedTask && previousPrerequisiteId && previousPrerequisiteId !== prerequisiteId) {
        await api.removeDependency(savedTask.id, previousPrerequisiteId);
        nextBoard = derivedBoard({ ...nextBoard, dependencies: nextBoard.dependencies.filter((dependency) => !(dependency.taskId === savedTask!.id && dependency.dependsOnId === previousPrerequisiteId)) });
      }
      setBoard(nextBoard);
      setModal({ open: false });
    });
  };

  const deleteTask = async (task: Task) => {
    await guarded(async () => {
      await api.deleteTask(task.id);
      setBoard(derivedBoard({ ...board, tasks: board.tasks.filter((item) => item.id !== task.id) }));
      setModal({ open: false });
    });
  };

  const suggestDependencies = async () => {
    const result = await api.suggestDependencies();
    setAiProvider(result.provider);
    return result;
  };

  const acceptSuggestion = async (suggestion: SuggestedDependency) => {
    try {
      const result = await api.addDependency(suggestion.taskId, suggestion.dependsOnId);
      highlightDateChanges(board, result.moved);
      setBoard(derivedBoard({ ...board, dependencies: [...board.dependencies, result.dependency], tasks: board.tasks.map((item) => {
        const change = result.moved.find((moved) => moved.taskId === item.id);
        return change ? { ...item, start_date: change.startDate, end_date: change.endDate } : item;
      }) }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onUnauthorized();
      else showToast(formatError(error, board));
      throw error;
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="wordmark"><span className="brand-mark small">TF</span><span>TaskFlow <b>Pro</b></span></div>
        <div className="topbar-actions">{aiProvider === 'mock' && <span className="mock-label">Mock data</span>}<span className="user-email">{user.email}</span><button className="ghost-button" onClick={() => void onLogout()}>Log out</button></div>
      </header>
      <main className="workspace">
        <div className="workspace-heading">
          <div><p className="eyebrow">Launch workspace</p><h1>Make progress visible.</h1><p className="subheading">A clear view of what is moving, what is waiting, and what comes next.</p></div>
          <button className="primary-button add-button" onClick={() => setModal({ open: true })}><span aria-hidden="true">+</span> New task</button>
        </div>
        {pageError && <div className="inline-error" role="alert">{pageError}</div>}
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="board" aria-label="Task board">
            {columns.map((column) => <Column key={column.status} column={column} tasks={board.tasks.filter((task) => task.status === column.status)} board={board} hoveredTaskId={hoveredTaskId} dateHighlights={dateHighlights} onHover={setHoveredTaskId} onEdit={(task) => setModal({ open: true, task })} />)}
          </div>
          <DragOverlay>{activeTask ? <TaskCard task={activeTask} preview /> : null}</DragOverlay>
        </DndContext>
      </main>
      {modal.open && <TaskModal task={modal.task} board={board} onClose={() => setModal({ open: false })} onSave={saveTask} onSuggest={suggestDependencies} onAcceptSuggestion={acceptSuggestion} onDelete={modal.task ? deleteTask : undefined} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Column({ column, tasks, board, hoveredTaskId, dateHighlights, onHover, onEdit }: { column: typeof columns[number]; tasks: Task[]; board: Board; hoveredTaskId: string | undefined; dateHighlights: Record<string, DateChange & { oldStartDate: string; oldEndDate: string }>; onHover: (id: string | undefined) => void; onEdit: (task: Task) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  return <section className={`column column-${column.accent} ${isOver ? 'column-over' : ''}`} ref={setNodeRef} aria-labelledby={`${column.status}-heading`}>
    <div className="column-heading"><div><span className="column-dot" /><h2 id={`${column.status}-heading`}>{column.label}</h2></div><span className="count">{tasks.length}</span></div>
    <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
      <div className="task-list">
        {tasks.length === 0 ? <div className="empty-column">Drop a task here</div> : tasks.map((task) => <SortableTask key={task.id} task={task} board={board} hoveredTaskId={hoveredTaskId} dateChange={dateHighlights[task.id]} onHover={onHover} onEdit={onEdit} />)}
      </div>
    </SortableContext>
  </section>;
}

function SortableTask({ task, board, hoveredTaskId, dateChange, onHover, onEdit }: { task: Task; board: Board; hoveredTaskId: string | undefined; dateChange: DateChange & { oldStartDate: string; oldEndDate: string } | undefined; onHover: (id: string | undefined) => void; onEdit: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const relations = hoveredTaskId ? graphRelations(board, hoveredTaskId) : undefined;
  const relationClass = hoveredTaskId && hoveredTaskId !== task.id
    ? relations?.upstream.has(task.id) ? 'graph-upstream' : relations?.downstream.has(task.id) ? 'graph-downstream' : 'graph-muted'
    : '';
  const needs = board.dependencies.filter((dependency) => dependency.taskId === task.id).length;
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`${isDragging ? 'task-dragging ' : ''}${relationClass}`} {...attributes} {...listeners}><TaskCard task={task} needs={needs} dateChange={dateChange} onHover={onHover} onEdit={onEdit} /></div>;
}

function TaskCard({ task, needs = task.blockers.length, dateChange, onHover, onEdit, preview = false }: { task: Task; needs?: number; dateChange?: (DateChange & { oldStartDate: string; oldEndDate: string }) | undefined; onHover?: ((id: string | undefined) => void) | undefined; onEdit?: ((task: Task) => void) | undefined; preview?: boolean }) {
  const blockerText = task.blockers.length ? `Blocked by: ${task.blockers.join(', ')}` : 'Ready to move forward';
  return <article className={`task-card ${preview ? 'task-preview' : ''} ${dateChange ? 'date-highlight' : ''}`} onMouseEnter={() => onHover?.(task.id)} onMouseLeave={() => onHover?.(undefined)} onClick={() => onEdit?.(task)}>
    <div className="task-card-top"><span className="task-label">Task</span><button className="card-menu" type="button" onClick={(event) => { event.stopPropagation(); onEdit?.(task); }} aria-label={`Edit ${task.title}`}>•••</button></div>
    <h3>{task.title}</h3>
    <div className="date-row"><span>{task.start_date}</span><span className="date-arrow">→</span><span>{task.end_date}</span></div>
    {dateChange && <div className="date-history">{dateChange.oldStartDate} → {dateChange.startDate}<br />{dateChange.oldEndDate} → {dateChange.endDate}</div>}
    <div className="card-meta">{needs > 0 && <span className="needs-chip">needs {needs}</span>}<span className={`state-badge ${task.blocked ? 'blocked' : 'ready'}`} title={blockerText}><span />{task.blocked ? 'Blocked' : 'Ready'}</span></div>
  </article>;
}

function TaskModal({ task, board, onClose, onSave, onSuggest, onAcceptSuggestion, onDelete }: { task: Task | undefined; board: Board; onClose: () => void; onSave: (input: TaskInput, task: Task | undefined, prerequisiteId: string | undefined, previousPrerequisiteId: string | undefined) => Promise<void>; onSuggest: () => Promise<SuggestionResult>; onAcceptSuggestion: (suggestion: SuggestedDependency) => Promise<void>; onDelete: ((task: Task) => Promise<void>) | undefined }) {
  const [input, setInput] = useState<TaskInput>(task ? taskInput(task) : blankTask);
  const previousPrerequisiteId = task ? board.dependencies.find((dependency) => dependency.taskId === task.id)?.dependsOnId : undefined;
  const [prerequisiteId, setPrerequisiteId] = useState(previousPrerequisiteId ?? '');
  const [suggestions, setSuggestions] = useState<SuggestedDependency[]>([]);
  const [rejectedSuggestions, setRejectedSuggestions] = useState<Array<{ suggestion: unknown; reason: string }>>([]);
  const [suggestionError, setSuggestionError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (field: keyof TaskInput, value: string) => setInput((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); await onSave(input, task, prerequisiteId || undefined, previousPrerequisiteId); setSaving(false); };
  const requestSuggestions = async () => {
    if (!task) return;
    setSuggesting(true);
    setSuggestionError('');
    try {
      const result = await onSuggest();
      setSuggestions(result.accepted.filter((suggestion) => suggestion.taskId === task.id));
      setRejectedSuggestions(result.rejected.filter((item) => typeof item.suggestion === 'object' && item.suggestion !== null && (item.suggestion as Record<string, unknown>).taskId === task.id));
    } catch (error) {
      setSuggestionError(errorMessage(error));
    } finally {
      setSuggesting(false);
    }
  };
  const accept = async (suggestion: SuggestedDependency) => {
    try {
      await onAcceptSuggestion(suggestion);
      setPrerequisiteId(suggestion.dependsOnId);
      setSuggestions((current) => current.filter((item) => item !== suggestion));
    } catch (error) {
      setSuggestionError(errorMessage(error));
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
      <div className="modal-heading"><div><p className="eyebrow">{task ? 'Edit task' : 'New task'}</p><h2 id="task-modal-title">{task ? 'Shape the next move.' : 'Add to the board.'}</h2></div><button className="close-button" onClick={onClose} aria-label="Close">×</button></div>
      <form onSubmit={submit} className="task-form">
        <label>Title<input value={input.title} onChange={(event) => set('title', event.target.value)} required /></label>
        <label>Description<textarea value={input.description} onChange={(event) => set('description', event.target.value)} rows={3} /></label>
        <div className="form-grid"><label>Status<select value={input.status} onChange={(event) => set('status', event.target.value)}>{columns.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}</select></label><label>Start date<input type="date" value={input.start_date} onChange={(event) => set('start_date', event.target.value)} required /></label><label>End date<input type="date" value={input.end_date} onChange={(event) => set('end_date', event.target.value)} required /></label></div>
        <label>Prerequisite<select value={prerequisiteId} onChange={(event) => setPrerequisiteId(event.target.value)}><option value="">No prerequisite</option>{board.tasks.filter((candidate) => candidate.id !== task?.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label>
        <div className="suggestion-panel"><div className="suggestion-heading"><div><strong>AI dependency suggestions</strong><small>Grounded in this board's current tasks and links.</small></div><button type="button" className="ghost-button" onClick={() => void requestSuggestions()} disabled={!task || suggesting}>{suggesting ? 'Thinking...' : 'Suggest dependencies'}</button></div>{suggestionError && <p className="form-error">{suggestionError}</p>}{suggestions.map((suggestion) => <div className="suggestion-row" key={`${suggestion.taskId}-${suggestion.dependsOnId}`}><span>Needs <b>{board.tasks.find((candidate) => candidate.id === suggestion.dependsOnId)?.title ?? suggestion.dependsOnId}</b></span><span><button type="button" className="accept-button" onClick={() => void accept(suggestion)}>Accept</button><button type="button" className="reject-button" onClick={() => setSuggestions((current) => current.filter((item) => item !== suggestion))}>Reject</button></span></div>)}{rejectedSuggestions.map((item, index) => <div className="suggestion-rejected" key={`${item.reason}-${index}`}>Rejected: {item.reason}</div>)}</div>
        <div className="modal-actions">{task && onDelete && <button type="button" className="danger-button" onClick={() => { if (window.confirm('Delete this task?')) void onDelete(task); }}>Delete</button>}<span /><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save task'}</button></div>
      </form>
    </section>
  </div>;
}
