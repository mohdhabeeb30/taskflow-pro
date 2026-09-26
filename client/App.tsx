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
import { api, ApiError, type Board, type Status, type Task, type TaskInput, type User } from './api.js';

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
      .then(setBoard)
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
      setBoard(await api.board());
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
  const dragSnapshot = useRef<Board | undefined>(undefined);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const guarded = async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onUnauthorized();
      else showToast(errorMessage(error));
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
    setBoard(rebalance(board, String(active.id), nextStatus, destination.length));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTask(undefined);
    if (!over || !dragSnapshot.current) return;
    const id = String(active.id);
    const nextStatus = targetStatus(board, String(over.id));
    if (!nextStatus) return;
    const targetTasks = board.tasks.filter((task) => task.status === nextStatus && task.id !== id);
    const overTaskIndex = targetTasks.findIndex((task) => task.id === over.id);
    const position = overTaskIndex >= 0 ? overTaskIndex : targetTasks.length;
    const optimistic = rebalance(board, id, nextStatus, position);
    setBoard(optimistic);
    guarded(async () => {
      try {
        await api.moveTask(id, nextStatus, position);
      } catch (error) {
        setBoard(dragSnapshot.current!);
        throw error;
      }
    }).catch(() => undefined);
    dragSnapshot.current = undefined;
  };

  const saveTask = async (input: TaskInput, task?: Task) => {
    await guarded(async () => {
      if (task) {
        const result = await api.updateTask(task.id, input);
        setBoard({ ...board, tasks: board.tasks.map((item) => item.id === task.id ? { ...item, ...result.task } : item) });
      } else {
        const result = await api.createTask(input);
        setBoard({ ...board, tasks: [...board.tasks, result.task] });
      }
      setModal({ open: false });
    });
  };

  const deleteTask = async (task: Task) => {
    await guarded(async () => {
      await api.deleteTask(task.id);
      setBoard({ ...board, tasks: board.tasks.filter((item) => item.id !== task.id) });
      setModal({ open: false });
    });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="wordmark"><span className="brand-mark small">TF</span><span>TaskFlow <b>Pro</b></span></div>
        <div className="topbar-actions"><span className="user-email">{user.email}</span><button className="ghost-button" onClick={() => void onLogout()}>Log out</button></div>
      </header>
      <main className="workspace">
        <div className="workspace-heading">
          <div><p className="eyebrow">Launch workspace</p><h1>Make progress visible.</h1><p className="subheading">A clear view of what is moving, what is waiting, and what comes next.</p></div>
          <button className="primary-button add-button" onClick={() => setModal({ open: true })}><span aria-hidden="true">+</span> New task</button>
        </div>
        {pageError && <div className="inline-error" role="alert">{pageError}</div>}
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="board" aria-label="Task board">
            {columns.map((column) => <Column key={column.status} column={column} tasks={board.tasks.filter((task) => task.status === column.status)} onEdit={(task) => setModal({ open: true, task })} />)}
          </div>
          <DragOverlay>{activeTask ? <TaskCard task={activeTask} preview /> : null}</DragOverlay>
        </DndContext>
      </main>
      {modal.open && <TaskModal task={modal.task} onClose={() => setModal({ open: false })} onSave={saveTask} onDelete={modal.task ? deleteTask : undefined} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Column({ column, tasks, onEdit }: { column: typeof columns[number]; tasks: Task[]; onEdit: (task: Task) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  return <section className={`column column-${column.accent} ${isOver ? 'column-over' : ''}`} ref={setNodeRef} aria-labelledby={`${column.status}-heading`}>
    <div className="column-heading"><div><span className="column-dot" /><h2 id={`${column.status}-heading`}>{column.label}</h2></div><span className="count">{tasks.length}</span></div>
    <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
      <div className="task-list">
        {tasks.length === 0 ? <div className="empty-column">Drop a task here</div> : tasks.map((task) => <SortableTask key={task.id} task={task} onEdit={onEdit} />)}
      </div>
    </SortableContext>
  </section>;
}

function SortableTask({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'task-dragging' : ''} {...attributes} {...listeners}><TaskCard task={task} onEdit={onEdit} /></div>;
}

function TaskCard({ task, onEdit, preview = false }: { task: Task; onEdit?: (task: Task) => void; preview?: boolean }) {
  const blockerText = task.blockers.length ? `Blocked by: ${task.blockers.join(', ')}` : 'Ready to move forward';
  return <article className={`task-card ${preview ? 'task-preview' : ''}`} onClick={() => onEdit?.(task)}>
    <div className="task-card-top"><span className="task-label">Task</span><button className="card-menu" type="button" onClick={(event) => { event.stopPropagation(); onEdit?.(task); }} aria-label={`Edit ${task.title}`}>•••</button></div>
    <h3>{task.title}</h3>
    <div className="date-row"><span>{task.start_date}</span><span className="date-arrow">→</span><span>{task.end_date}</span></div>
    <span className={`state-badge ${task.blocked ? 'blocked' : 'ready'}`} title={blockerText}><span />{task.blocked ? 'Blocked' : 'Ready'}</span>
  </article>;
}

function TaskModal({ task, onClose, onSave, onDelete }: { task: Task | undefined; onClose: () => void; onSave: (input: TaskInput, task?: Task) => Promise<void>; onDelete: ((task: Task) => Promise<void>) | undefined }) {
  const [input, setInput] = useState<TaskInput>(task ? taskInput(task) : blankTask);
  const [saving, setSaving] = useState(false);
  const set = (field: keyof TaskInput, value: string) => setInput((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); await onSave(input, task); setSaving(false); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
      <div className="modal-heading"><div><p className="eyebrow">{task ? 'Edit task' : 'New task'}</p><h2 id="task-modal-title">{task ? 'Shape the next move.' : 'Add to the board.'}</h2></div><button className="close-button" onClick={onClose} aria-label="Close">×</button></div>
      <form onSubmit={submit} className="task-form">
        <label>Title<input value={input.title} onChange={(event) => set('title', event.target.value)} required /></label>
        <label>Description<textarea value={input.description} onChange={(event) => set('description', event.target.value)} rows={3} /></label>
        <div className="form-grid"><label>Status<select value={input.status} onChange={(event) => set('status', event.target.value)}>{columns.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}</select></label><label>Start date<input type="date" value={input.start_date} onChange={(event) => set('start_date', event.target.value)} required /></label><label>End date<input type="date" value={input.end_date} onChange={(event) => set('end_date', event.target.value)} required /></label></div>
        <div className="modal-actions">{task && onDelete && <button type="button" className="danger-button" onClick={() => { if (window.confirm('Delete this task?')) void onDelete(task); }}>Delete</button>}<span /><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save task'}</button></div>
      </form>
    </section>
  </div>;
}
