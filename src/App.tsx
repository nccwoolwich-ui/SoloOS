/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Briefcase, 
  Timer, 
  Users, 
  FileText, 
  Plus, 
  CheckCircle2, 
  Circle, 
  Play, 
  Pause, 
  RotateCcw, 
  AlertTriangle, 
  ChevronRight, 
  LogOut, 
  LogIn,
  Trash2,
  Clock,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  orderBy, 
  limit,
  getDocs
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';

import { db, auth } from './firebase';
import { Project, Decision, Priority, Role, ProjectStage, ProjectStatus } from './types';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, icon: Icon }: any) => {
  const variants: any = {
    primary: 'bg-black text-white hover:bg-zinc-800',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
    outline: 'border border-zinc-200 text-zinc-900 hover:bg-zinc-50',
    ghost: 'text-zinc-600 hover:bg-zinc-100',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }: any) => (
  <div className={`bg-white border border-zinc-100 rounded-xl shadow-sm p-5 ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'neutral' }: any) => {
  const variants: any = {
    neutral: 'bg-zinc-100 text-zinc-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    error: 'bg-red-50 text-red-600',
    info: 'bg-blue-50 text-blue-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [projects, setProjects] = useState<Project[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Focus Mode State
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [focusTime, setFocusTime] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [focusTask, setFocusTask] = useState('');

  // Role Suggestions State
  const [roleSuggestions, setRoleSuggestions] = useState<Record<Role, string | null>>({
    'CEO': null,
    'Project Manager': null,
    'Developer': null,
    'Marketing': null
  });
  const [isGenerating, setIsGenerating] = useState<Role | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const projectsQuery = query(collection(db, 'projects'), where('uid', '==', user.uid));
    const unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'projects'));

    const today = new Date().toISOString().split('T')[0];
    const prioritiesQuery = query(
      collection(db, 'priorities'), 
      where('uid', '==', user.uid),
      where('date', '==', today),
      limit(3)
    );
    const unsubscribePriorities = onSnapshot(prioritiesQuery, (snapshot) => {
      setPriorities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Priority)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'priorities'));

    const decisionsQuery = query(
      collection(db, 'decisions'), 
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(10)
    );
    const unsubscribeDecisions = onSnapshot(decisionsQuery, (snapshot) => {
      setDecisions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Decision)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'decisions'));

    return () => {
      unsubscribeProjects();
      unsubscribePriorities();
      unsubscribeDecisions();
    };
  }, [user, isAuthReady]);

  // Timer Logic
  useEffect(() => {
    let interval: any;
    if (isTimerRunning && focusTime > 0) {
      interval = setInterval(() => {
        setFocusTime(prev => prev - 1);
      }, 1000);
    } else if (focusTime === 0) {
      setIsTimerRunning(false);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, focusTime]);

  // AI Suggestion Logic
  const generateSuggestion = async (role: Role) => {
    if (!process.env.GEMINI_API_KEY) return;
    setIsGenerating(role);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Current projects: ${projects.map(p => `${p.name} (${p.stage})`).join(', ')}`,
        config: {
          systemInstruction: `You are a ${role} for a solopreneur. Provide 3 high-impact, actionable suggestions based on the current role. Keep it concise and professional.`,
        }
      });
      const response = await model;
      setRoleSuggestions(prev => ({ ...prev, [role]: response.text }));
    } catch (error) {
      console.error('AI Error:', error);
    } finally {
      setIsGenerating(null);
    }
  };

  // Handlers
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login Error:', error);
    }
  };

  const handleLogout = () => signOut(auth);

  const addPriority = async (text: string) => {
    if (!user || priorities.length >= 3) return;
    const today = new Date().toISOString().split('T')[0];
    try {
      await addDoc(collection(db, 'priorities'), {
        text,
        completed: false,
        date: today,
        uid: user.uid
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'priorities');
    }
  };

  const togglePriority = async (priority: Priority) => {
    try {
      await updateDoc(doc(db, 'priorities', priority.id), {
        completed: !priority.completed
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `priorities/${priority.id}`);
    }
  };

  const deletePriority = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'priorities', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `priorities/${id}`);
    }
  };

  const addProject = async () => {
    if (!user) return;
    const name = prompt('Project Name:');
    if (!name) return;
    try {
      await addDoc(collection(db, 'projects'), {
        name,
        stage: 'idea',
        nextAction: 'Define project scope',
        status: 'active',
        lastProgress: serverTimestamp(),
        uid: user.uid
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'projects');
    }
  };

  const updateProject = async (id: string, updates: Partial<Project>) => {
    try {
      await updateDoc(doc(db, 'projects', id), {
        ...updates,
        lastProgress: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${id}`);
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `projects/${id}`);
    }
  };

  const addDecision = async () => {
    if (!user) return;
    const title = prompt('Decision Title:');
    if (!title) return;
    const context = prompt('Context (optional):') || '';
    const outcome = prompt('Outcome (optional):') || '';
    try {
      await addDoc(collection(db, 'decisions'), {
        title,
        context,
        outcome,
        timestamp: serverTimestamp(),
        uid: user.uid
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'decisions');
    }
  };

  const deleteDecision = async (id: string) => {
    if (!confirm('Delete this decision record?')) return;
    try {
      await deleteDoc(doc(db, 'decisions', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `decisions/${id}`);
    }
  };

  // Rules & Flags
  const activeProjectsCount = projects.filter(p => p.status === 'active').length;
  const isOverloaded = activeProjectsCount > 3;

  const flaggedProjects = projects.filter(p => {
    if (!p.lastProgress) return false;
    const lastDate = p.lastProgress.toDate();
    const diffDays = (new Date().getTime() - lastDate.getTime()) / (1000 * 3600 * 24);
    return diffDays > 3 && p.status === 'active';
  });

  // Render Helpers
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-zinc-200 rounded-full" />
          <div className="h-4 w-24 bg-zinc-200 rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
        <Card className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-black text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <LayoutDashboard size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">SoloOS</h1>
            <p className="text-zinc-500">The command center for the modern solopreneur.</p>
          </div>
          <Button onClick={handleLogin} className="w-full py-3" icon={LogIn}>
            Sign in with Google
          </Button>
        </Card>
      </div>
    );
  }

  if (isFocusMode) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-lg w-full text-center space-y-12"
        >
          <div className="space-y-4">
            <h2 className="text-zinc-500 uppercase tracking-widest text-sm font-bold">Focus Mode</h2>
            <h1 className="text-4xl font-bold tracking-tight">
              {focusTask || 'What are you working on?'}
            </h1>
          </div>

          <div className="text-9xl font-mono tracking-tighter">
            {formatTime(focusTime)}
          </div>

          <div className="flex items-center justify-center gap-6">
            <button 
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
            >
              {isTimerRunning ? <Pause size={32} /> : <Play size={32} className="ml-1" />}
            </button>
            <button 
              onClick={() => {
                setIsTimerRunning(false);
                setFocusTime(25 * 60);
              }}
              className="w-14 h-14 rounded-full border border-zinc-800 text-zinc-400 flex items-center justify-center hover:bg-zinc-900 transition-colors"
            >
              <RotateCcw size={24} />
            </button>
          </div>

          <Button 
            variant="ghost" 
            onClick={() => setIsFocusMode(false)}
            className="text-zinc-500 hover:text-white"
          >
            Exit Focus Mode
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <nav className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-zinc-200 p-4 flex flex-col">
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-8 h-8 bg-black text-white rounded-lg flex items-center justify-center">
            <LayoutDashboard size={18} />
          </div>
          <span className="font-bold text-xl tracking-tight">SoloOS</span>
        </div>

        <div className="flex-1 space-y-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'projects', label: 'Projects', icon: Briefcase },
            { id: 'focus', label: 'Focus Mode', icon: Timer },
            { id: 'roles', label: 'Roles', icon: Users },
            { id: 'decisions', label: 'Decision Log', icon: FileText },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id 
                  ? 'bg-zinc-100 text-black' 
                  : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="pt-4 border-t border-zinc-100 mt-auto">
          <div className="flex items-center gap-3 px-2 mb-4">
            <img src={user.photoURL || ''} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.displayName}</p>
              <p className="text-xs text-zinc-500 truncate">{user.email}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-red-500 hover:bg-red-50" icon={LogOut}>
            Sign Out
          </Button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl space-y-8"
            >
              <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                  <p className="text-zinc-500">Welcome back, {user.displayName?.split(' ')[0]}.</p>
                </div>
                {isOverloaded && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3 text-amber-700">
                    <AlertTriangle size={20} />
                    <div className="text-sm">
                      <p className="font-bold">Overloaded</p>
                      <p>You have {activeProjectsCount} active projects. Focus on 2-3 max.</p>
                    </div>
                  </div>
                )}
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Priorities */}
                <Card className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-zinc-400" />
                      Today's Priorities
                    </h2>
                    <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
                      {priorities.length}/3
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    {priorities.map(p => (
                      <div key={p.id} className="flex items-center gap-3 group">
                        <button 
                          onClick={() => togglePriority(p)}
                          className={`transition-colors ${p.completed ? 'text-emerald-500' : 'text-zinc-300 hover:text-zinc-400'}`}
                        >
                          {p.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        </button>
                        <span className={`flex-1 text-sm ${p.completed ? 'text-zinc-400 line-through' : 'text-zinc-700'}`}>
                          {p.text}
                        </span>
                        <button onClick={() => deletePriority(p.id)} className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-all">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {priorities.length < 3 && (
                      <button 
                        onClick={() => {
                          const text = prompt('New Priority:');
                          if (text) addPriority(text);
                        }}
                        className="w-full flex items-center gap-3 p-2 rounded-lg border border-dashed border-zinc-200 text-zinc-400 hover:text-zinc-600 hover:border-zinc-300 transition-all text-sm"
                      >
                        <Plus size={18} />
                        Add a priority
                      </button>
                    )}
                  </div>
                </Card>

                {/* Quick Stats */}
                <div className="space-y-6">
                  <Card className="bg-black text-white border-0">
                    <div className="space-y-4">
                      <p className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Active Projects</p>
                      <div className="flex items-end justify-between">
                        <span className="text-5xl font-bold tracking-tighter">{activeProjectsCount}</span>
                        <Button variant="ghost" onClick={() => setActiveTab('projects')} className="text-zinc-400 hover:text-white p-0 h-auto">
                          View All <ArrowRight size={16} />
                        </Button>
                      </div>
                    </div>
                  </Card>

                  {flaggedProjects.length > 0 && (
                    <Card className="border-red-100 bg-red-50/30">
                      <div className="space-y-3">
                        <h3 className="text-sm font-bold text-red-700 flex items-center gap-2">
                          <Clock size={16} />
                          Stalled Projects
                        </h3>
                        <div className="space-y-2">
                          {flaggedProjects.map(p => (
                            <div key={p.id} className="flex items-center justify-between text-xs">
                              <span className="font-medium text-zinc-700">{p.name}</span>
                              <span className="text-zinc-400">No progress in 3+ days</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'projects' && (
            <motion.div 
              key="projects"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <header className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
                  <p className="text-zinc-500">Manage your active builds and ideas.</p>
                </div>
                <Button onClick={addProject} icon={Plus}>New Project</Button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map(project => (
                  <Card key={project.id} className="flex flex-col gap-4 group">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="font-bold text-lg">{project.name}</h3>
                        <div className="flex gap-2">
                          <Badge variant={project.status === 'active' ? 'success' : project.status === 'paused' ? 'warning' : 'error'}>
                            {project.status}
                          </Badge>
                          <Badge>{project.stage}</Badge>
                        </div>
                      </div>
                      <button onClick={() => deleteProject(project.id)} className="text-zinc-300 hover:text-red-500 transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>

                    <div className="bg-zinc-50 rounded-lg p-3 space-y-2">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Next Action</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-zinc-700 font-medium">{project.nextAction}</p>
                        <button 
                          onClick={() => {
                            const action = prompt('New Next Action:', project.nextAction);
                            if (action) updateProject(project.id, { nextAction: action });
                          }}
                          className="text-zinc-400 hover:text-black"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-auto pt-4 border-t border-zinc-100 grid grid-cols-2 gap-2">
                      <select 
                        value={project.status}
                        onChange={(e) => updateProject(project.id, { status: e.target.value as ProjectStatus })}
                        className="text-xs bg-transparent border-0 font-medium text-zinc-500 focus:ring-0 cursor-pointer"
                      >
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="blocked">Blocked</option>
                      </select>
                      <select 
                        value={project.stage}
                        onChange={(e) => updateProject(project.id, { stage: e.target.value as ProjectStage })}
                        className="text-xs bg-transparent border-0 font-medium text-zinc-500 focus:ring-0 cursor-pointer text-right"
                      >
                        <option value="idea">Idea</option>
                        <option value="build">Build</option>
                        <option value="test">Test</option>
                        <option value="launch">Launch</option>
                        <option value="grow">Grow</option>
                      </select>
                    </div>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'focus' && (
            <motion.div 
              key="focus"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto text-center space-y-8 py-12"
            >
              <div className="space-y-4">
                <h1 className="text-4xl font-bold tracking-tight">Focus Mode</h1>
                <p className="text-zinc-500">Eliminate distractions and get deep work done.</p>
              </div>

              <Card className="p-10 space-y-8">
                <div className="space-y-4">
                  <label className="text-sm font-bold text-zinc-400 uppercase tracking-wider">What are you focusing on?</label>
                  <input 
                    type="text" 
                    placeholder="e.g., Designing landing page"
                    value={focusTask}
                    onChange={(e) => setFocusTask(e.target.value)}
                    className="w-full text-2xl text-center font-bold border-0 border-b-2 border-zinc-100 focus:border-black focus:ring-0 pb-2"
                  />
                </div>

                <div className="flex items-center justify-center gap-4">
                  {[15, 25, 45, 60].map(mins => (
                    <button 
                      key={mins}
                      onClick={() => setFocusTime(mins * 60)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        focusTime === mins * 60 ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>

                <Button 
                  onClick={() => {
                    if (!focusTask) {
                      alert('Please enter a task first.');
                      return;
                    }
                    setIsFocusMode(true);
                    setIsTimerRunning(true);
                  }}
                  className="w-full py-4 text-lg" 
                  icon={Play}
                >
                  Start Focus Session
                </Button>
              </Card>
            </motion.div>
          )}

          {activeTab === 'roles' && (
            <motion.div 
              key="roles"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <header>
                <h1 className="text-3xl font-bold tracking-tight">Role Suggestions</h1>
                <p className="text-zinc-500">Get AI-powered advice from different perspectives.</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {(['CEO', 'Project Manager', 'Developer', 'Marketing'] as Role[]).map(role => (
                  <Button 
                    key={role}
                    variant={isGenerating === role ? 'secondary' : 'outline'}
                    onClick={() => generateSuggestion(role)}
                    disabled={isGenerating !== null}
                    className="h-24 flex-col"
                  >
                    <Sparkles size={20} className={isGenerating === role ? 'animate-spin' : ''} />
                    {role}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(['CEO', 'Project Manager', 'Developer', 'Marketing'] as Role[]).map(role => (
                  roleSuggestions[role] && (
                    <Card key={role} className="space-y-4">
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                        <h3 className="font-bold flex items-center gap-2">
                          <Users size={18} />
                          {role} Advice
                        </h3>
                        <Button variant="ghost" className="p-0 h-auto text-xs" onClick={() => setRoleSuggestions(prev => ({ ...prev, [role]: null }))}>Clear</Button>
                      </div>
                      <div className="prose prose-sm max-w-none text-zinc-600">
                        <ReactMarkdown>{roleSuggestions[role]!}</ReactMarkdown>
                      </div>
                    </Card>
                  )
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'decisions' && (
            <motion.div 
              key="decisions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-3xl space-y-8"
            >
              <header className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Decision Log</h1>
                  <p className="text-zinc-500">Record key choices to track your progress.</p>
                </div>
                <Button onClick={addDecision} icon={Plus}>Log Decision</Button>
              </header>

              <div className="space-y-4">
                {decisions.map(decision => (
                  <Card key={decision.id} className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="font-bold text-lg">{decision.title}</h3>
                        <p className="text-xs text-zinc-400">
                          {decision.timestamp?.toDate().toLocaleDateString()} at {decision.timestamp?.toDate().toLocaleTimeString()}
                        </p>
                      </div>
                      <button onClick={() => deleteDecision(decision.id)} className="text-zinc-300 hover:text-red-500 transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>
                    
                    {decision.context && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Context</p>
                        <p className="text-sm text-zinc-600">{decision.context}</p>
                      </div>
                    )}
                    
                    {decision.outcome && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Outcome</p>
                        <p className="text-sm text-zinc-700 font-medium">{decision.outcome}</p>
                      </div>
                    )}
                  </Card>
                ))}
                {decisions.length === 0 && (
                  <div className="text-center py-20 bg-white border border-dashed border-zinc-200 rounded-xl text-zinc-400">
                    <FileText size={48} className="mx-auto mb-4 opacity-20" />
                    <p>No decisions recorded yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
