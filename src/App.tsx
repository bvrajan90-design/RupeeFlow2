import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  PieChart as PieChartIcon, 
  History, 
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  X,
  ChevronRight,
  Wallet2,
  CreditCard,
  Banknote,
  Receipt,
  Download,
  Calendar,
  Target,
  AlertCircle,
  Flag,
  Trophy,
  Coins,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  addDoc, 
  deleteDoc, 
  updateDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

import { Transaction, TransactionType, FinancialInsight, Budget, Goal } from './types';
import { CATEGORIES, CURRENCY_SYMBOL } from './constants';
import { getFinancialInsights } from './services/geminiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('rupeeflow_darkmode');
    if (saved !== null) return JSON.parse(saved);
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [insights, setInsights] = useState<FinancialInsight[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Auth & Data Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Ensure user profile exists
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            const newProfile = {
              uid: currentUser.uid,
              displayName: currentUser.displayName,
              email: currentUser.email,
              photoURL: currentUser.photoURL,
              currency: '₹',
              isDarkMode,
              createdAt: new Date().toISOString()
            };
            await setDoc(userRef, newProfile);
            setUserProfile(newProfile);
          } else {
            setUserProfile(userDoc.data());
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
        }
      } else {
        setUserProfile(null);
        setTransactions([]);
        setBudgets({});
        setGoals([]);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Sync Transactions
  useEffect(() => {
    if (!user || !isAuthReady) return;
    const q = query(collection(db, 'users', user.uid, 'transactions'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        date: (doc.data().date as Timestamp).toDate().toISOString()
      })) as Transaction[];
      setTransactions(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/transactions`));
    return () => unsubscribe();
  }, [user, isAuthReady]);

  // Sync Budgets
  useEffect(() => {
    if (!user || !isAuthReady) return;
    const unsubscribe = onSnapshot(collection(db, 'users', user.uid, 'budgets'), (snapshot) => {
      const data: Record<string, number> = {};
      snapshot.docs.forEach(doc => {
        data[doc.id] = doc.data().limit;
      });
      setBudgets(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/budgets`));
    return () => unsubscribe();
  }, [user, isAuthReady]);

  // Sync Goals
  useEffect(() => {
    if (!user || !isAuthReady) return;
    const unsubscribe = onSnapshot(collection(db, 'users', user.uid, 'goals'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Goal[];
      setGoals(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/goals`));
    return () => unsubscribe();
  }, [user, isAuthReady]);

  // Goal Form State
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalCurrent, setGoalCurrent] = useState('');
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  // Export State
  const [exportStartDate, setExportStartDate] = useState(format(new Date(new Date().setDate(new Date().getDate() - 30)), 'yyyy-MM-dd'));
  const [exportEndDate, setExportEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Form State
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState(CATEGORIES.find(c => c.type === 'expense')?.id || '');
  const [description, setDescription] = useState('');

  useEffect(() => {
    localStorage.setItem('rupeeflow_transactions', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('rupeeflow_budgets', JSON.stringify(budgets));
  }, [budgets]);

  useEffect(() => {
    localStorage.setItem('rupeeflow_goals', JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem('rupeeflow_darkmode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const stats = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    return {
      income,
      expenses,
      balance: income - expenses
    };
  }, [transactions]);

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return format(date, 'MMM dd');
    });

    return last7Days.map(day => {
      const dayTransactions = transactions.filter(t => format(new Date(t.date), 'MMM dd') === day);
      return {
        name: day,
        income: dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
        expense: dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
      };
    });
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = (t.description || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (CATEGORIES.find(c => c.id === t.category)?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [transactions, searchQuery, selectedCategory]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || !user) return;

    const newTransaction = {
      uid: user.uid,
      amount: Number(amount),
      type,
      category,
      description,
      date: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'users', user.uid, 'transactions'), newTransaction);
      setIsModalOpen(false);
      setAmount('');
      setDescription('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/transactions`);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'transactions', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/transactions/${id}`);
    }
  };

  const fetchInsights = async () => {
    if (transactions.length === 0) return;
    setIsAnalyzing(true);
    const newInsights = await getFinancialInsights(transactions, budgets, goals);
    if (newInsights) setInsights(newInsights);
    setIsAnalyzing(false);
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalName || !goalTarget || !user) return;

    try {
      if (editingGoalId) {
        await updateDoc(doc(db, 'users', user.uid, 'goals', editingGoalId), {
          name: goalName,
          targetAmount: Number(goalTarget),
          currentAmount: Number(goalCurrent) || 0
        });
      } else {
        const newGoal = {
          uid: user.uid,
          name: goalName,
          targetAmount: Number(goalTarget),
          currentAmount: Number(goalCurrent) || 0,
          color: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][Math.floor(Math.random() * 5)]
        };
        await addDoc(collection(db, 'users', user.uid, 'goals'), newGoal);
      }

      setIsGoalModalOpen(false);
      setGoalName('');
      setGoalTarget('');
      setGoalCurrent('');
      setEditingGoalId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/goals`);
    }
  };

  const deleteGoal = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'goals', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/goals/${id}`);
    }
  };

  const editGoal = (goal: Goal) => {
    setGoalName(goal.name);
    setGoalTarget(goal.targetAmount.toString());
    setGoalCurrent(goal.currentAmount.toString());
    setEditingGoalId(goal.id);
    setIsGoalModalOpen(true);
  };

  const budgetProgress = useMemo(() => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthTransactions = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear && t.type === 'expense';
    });

    return Object.entries(budgets).map(([catId, limit]) => {
      const budgetLimit = Number(limit);
      const spent = monthTransactions
        .filter(t => t.category === catId)
        .reduce((sum, t) => sum + t.amount, 0);
      const category = CATEGORIES.find(c => c.id === catId);
      return {
        id: catId,
        name: category?.name || catId,
        limit: budgetLimit,
        spent,
        percent: Math.min((spent / budgetLimit) * 100, 100),
        color: category?.color || '#94a3b8'
      };
    });
  }, [transactions, budgets]);

  const handleSetBudget = async (catId: string, amount: string) => {
    if (!user) return;
    const val = Number(amount);
    try {
      if (isNaN(val) || val <= 0) {
        await deleteDoc(doc(db, 'users', user.uid, 'budgets', catId));
      } else {
        await setDoc(doc(db, 'users', user.uid, 'budgets', catId), {
          uid: user.uid,
          categoryId: catId,
          limit: val
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/budgets/${catId}`);
    }
  };

  const handleExportCSV = () => {
    const filtered = transactions.filter(t => {
      const date = new Date(t.date);
      return date >= new Date(exportStartDate) && date <= new Date(exportEndDate + 'T23:59:59');
    });

    if (filtered.length === 0) {
      alert('No transactions found in the selected date range.');
      return;
    }

    const headers = ['Date', 'Type', 'Category', 'Description', `Amount (${CURRENCY_SYMBOL})`].join(',');
    const rows = filtered.map(t => {
      const cat = CATEGORIES.find(c => c.id === t.category)?.name || t.category;
      return [
        format(new Date(t.date), 'yyyy-MM-dd HH:mm'),
        t.type,
        cat,
        `"${t.description.replace(/"/g, '""')}"`,
        t.amount
      ].join(',');
    });

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `RupeeFlow_Export_${exportStartDate}_to_${exportEndDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportModalOpen(false);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white dark:bg-slate-900 rounded-[40px] p-10 shadow-2xl text-center space-y-8 border border-slate-100 dark:border-slate-800"
        >
          <div className="w-20 h-20 gradient-balance rounded-3xl flex items-center justify-center text-white mx-auto shadow-xl rotate-6">
            <Wallet2 size={40} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Welcome to RupeeFlow</h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Your personal finance companion, powered by AI.</p>
          </div>
          <button 
            onClick={signInWithGoogle}
            className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-3xl font-black text-lg shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
            Sign in with Google
          </button>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Secure & Private • Cloud Sync</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 font-sans transition-colors duration-300">
      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-4 right-4 z-[100] max-w-md mx-auto"
          >
            <div className="bg-rose-500 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} />
                <p className="text-xs font-bold">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="p-1 hover:bg-white/20 rounded-full">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 gradient-balance rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none rotate-3">
              <Wallet2 size={24} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">RupeeFlow</h1>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Smart Tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsSettingsOpen(true)}
              className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full flex items-center justify-center shadow-sm"
              title="Settings"
            >
              <div className="w-6 h-6 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Profile" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-indigo-500 flex items-center justify-center text-[10px] text-white font-bold">
                    {user?.displayName?.charAt(0) || 'U'}
                  </div>
                )}
              </div>
            </motion.button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-8">
        {activeTab === 'dashboard' ? (
          <>
            {/* Balance Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="gradient-balance rounded-[32px] p-8 text-white shadow-2xl shadow-indigo-200 dark:shadow-none relative overflow-hidden"
            >
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-indigo-100 text-sm font-medium">Total Balance</p>
                  <div className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md">
                    Active
                  </div>
                </div>
                <h2 className="text-5xl font-extrabold mb-8 tracking-tighter">
                  {CURRENCY_SYMBOL}{stats.balance.toLocaleString('en-IN')}
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                    <div className="flex items-center gap-1 text-emerald-300 mb-1">
                      <ArrowUpRight size={16} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Income</span>
                    </div>
                    <p className="text-lg font-bold">{CURRENCY_SYMBOL}{stats.income.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                    <div className="flex items-center gap-1 text-rose-300 mb-1">
                      <ArrowDownRight size={16} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Expense</span>
                    </div>
                    <p className="text-lg font-bold">{CURRENCY_SYMBOL}{stats.expenses.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>
              {/* Decorative elements */}
              <div className="absolute -right-10 -top-10 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-indigo-400/20 rounded-full blur-3xl" />
            </motion.div>

            {/* Gemini Insights Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-900 dark:text-slate-50 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Sparkles size={16} className="text-indigo-500 fill-indigo-500" />
                  Gemini Insights
                </h3>
                <button 
                  onClick={fetchInsights}
                  disabled={isAnalyzing || transactions.length === 0}
                  className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700 disabled:opacity-50 flex items-center gap-1"
                >
                  {isAnalyzing ? 'Analyzing...' : (
                    <>
                      Analyze <ChevronRight size={12} />
                    </>
                  )}
                </button>
              </div>
              
              <div className="space-y-3">
                {insights.length > 0 ? (
                  insights.map((insight, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={cn(
                        "p-5 rounded-3xl border-2 flex gap-4 shadow-sm",
                        insight.type === 'tip' && "bg-blue-50/50 border-blue-100 text-blue-900",
                        insight.type === 'warning' && "bg-rose-50/50 border-rose-100 text-rose-900",
                        insight.type === 'positive' && "bg-emerald-50/50 border-emerald-100 text-emerald-900"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                        insight.type === 'tip' && "bg-blue-500 text-white",
                        insight.type === 'warning' && "bg-rose-500 text-white",
                        insight.type === 'positive' && "bg-emerald-500 text-white"
                      )}>
                        <Sparkles size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold mb-1">{insight.title}</h4>
                        <p className="text-xs leading-relaxed font-medium opacity-80">{insight.content}</p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="bg-white dark:bg-slate-900/50 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[32px] p-8 text-center">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-700">
                      <Sparkles size={32} className="text-slate-300 dark:text-slate-600" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 dark:text-slate-500 mb-1">Unlock Smart Insights</p>
                    <p className="text-[10px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest">Add transactions to begin</p>
                  </div>
                )}
              </div>
            </section>

            {/* Budget Progress Section */}
            {budgetProgress.length > 0 && (
              <section className="space-y-4">
                <h3 className="text-xs font-black text-slate-900 dark:text-slate-50 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Target size={16} className="text-slate-400" />
                  Monthly Budgets
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {budgetProgress.map((budget) => (
                    <div key={budget.id} className="bg-white dark:bg-slate-900/80 p-5 rounded-[24px] border border-slate-100 dark:border-slate-800 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                            style={{ backgroundColor: budget.color }}
                          >
                            <Receipt size={16} />
                          </div>
                          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-50">{budget.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-slate-900 dark:text-slate-50">{CURRENCY_SYMBOL}{budget.spent.toLocaleString('en-IN')}</span>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">/ {CURRENCY_SYMBOL}{budget.limit.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${budget.percent}%` }}
                          className={cn(
                            "h-full rounded-full transition-all",
                            budget.percent > 90 ? "bg-rose-500" : budget.percent > 70 ? "bg-amber-500" : "bg-indigo-500"
                          )}
                        />
                      </div>
                      {budget.spent > budget.limit && (
                        <div className="flex items-center gap-1 text-rose-600">
                          <AlertCircle size={12} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Over Budget</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Savings Goals Section */}
            {goals.length > 0 && (
              <section className="space-y-4">
                <h3 className="text-xs font-black text-slate-900 dark:text-slate-50 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Trophy size={16} className="text-slate-400" />
                  Savings Goals
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {goals.map((goal) => {
                    const percent = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
                    return (
                      <div key={goal.id} className="bg-white dark:bg-slate-900/80 p-6 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm space-y-4 relative overflow-hidden group">
                        <div className="flex items-center justify-between relative z-10">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg"
                              style={{ backgroundColor: goal.color }}
                            >
                              <Coins size={20} />
                            </div>
                            <div>
                              <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-50">{goal.name}</h4>
                              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                {percent.toFixed(0)}% Achieved
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => editGoal(goal)}
                              className="p-2 text-slate-300 dark:text-slate-600 hover:text-indigo-500 transition-colors"
                            >
                              <ChevronRight size={20} />
                            </button>
                            <button 
                              onClick={() => deleteGoal(goal.id)}
                              className="p-2 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                        
                        <div className="space-y-2 relative z-10">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                            <span className="text-slate-400 dark:text-slate-500">Progress</span>
                            <span className="text-slate-900 dark:text-slate-50">{CURRENCY_SYMBOL}{goal.currentAmount.toLocaleString('en-IN')} / {CURRENCY_SYMBOL}{goal.targetAmount.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="h-3 w-full bg-slate-50 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-100 dark:border-slate-700">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${percent}%` }}
                              className="h-full rounded-full transition-all"
                              style={{ backgroundColor: goal.color }}
                            />
                          </div>
                        </div>

                        {percent === 100 && (
                          <div className="absolute top-2 right-2">
                            <div className="bg-emerald-500 text-white p-1 rounded-full shadow-lg">
                              <Trophy size={12} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Analytics Section */}
            <section className="space-y-4">
              <h3 className="text-xs font-black text-slate-900 dark:text-slate-50 uppercase tracking-[0.2em] flex items-center gap-2">
                <TrendingUp size={16} className="text-slate-400" />
                Analytics
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="bg-white dark:bg-slate-900/80 rounded-[32px] p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Weekly Spending</p>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#1e293b" : "#f1f5f9"} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: isDarkMode ? '#475569' : '#94a3b8', fontWeight: 700}} />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800">
                                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">{label}</p>
                                  <div className="space-y-1">
                                    {payload.map((entry: any, index: number) => (
                                      <div key={index} className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 capitalize">{entry.name}</span>
                                        </div>
                                        <span className="text-xs font-black text-slate-900 dark:text-slate-50">
                                          {CURRENCY_SYMBOL}{entry.value.toLocaleString('en-IN')}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="income" 
                          stroke="#10b981" 
                          fillOpacity={1} 
                          fill="url(#colorIncome)" 
                          strokeWidth={4}
                          activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="expense" 
                          stroke="#ef4444" 
                          fillOpacity={1} 
                          fill="url(#colorExpense)" 
                          strokeWidth={4}
                          activeDot={{ r: 6, strokeWidth: 0, fill: '#ef4444' }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : (
          /* Transactions List */
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-900 dark:text-slate-50 uppercase tracking-[0.2em] flex items-center gap-2">
                <History size={16} className="text-slate-400" />
                All Transactions
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filteredTransactions.length} items</span>
              </div>
            </div>

            {/* Search and Filter */}
            <div className="space-y-4">
              <div className="relative">
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search transactions..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pl-10 pr-4 text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Receipt size={18} />
                </div>
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={cn(
                    "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all",
                    selectedCategory === 'all' 
                      ? "bg-indigo-600 text-white shadow-md" 
                      : "bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800"
                  )}
                >
                  All
                </button>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={cn(
                      "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex items-center gap-2",
                      selectedCategory === cat.id 
                        ? "bg-indigo-600 text-white shadow-md" 
                        : "bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800"
                    )}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map((t) => {
                    const cat = CATEGORIES.find(c => c.id === t.category);
                    return (
                      <motion.div
                        layout
                        key={t.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white dark:bg-slate-900/80 p-5 rounded-[24px] border border-slate-100 dark:border-slate-800 flex items-center justify-between group hover:shadow-md transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div 
                            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg"
                            style={{ backgroundColor: cat?.color || '#94a3b8' }}
                          >
                            <Receipt size={24} />
                          </div>
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-50 leading-tight">{t.description || cat?.name}</h4>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                              {format(new Date(t.date), 'MMM dd, yyyy')} • {cat?.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={cn(
                              "text-sm font-black tracking-tight",
                              t.type === 'income' ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            )}>
                              {t.type === 'income' ? '+' : '-'}{CURRENCY_SYMBOL}{t.amount.toLocaleString('en-IN')}
                            </p>
                          </div>
                          <button 
                            onClick={() => deleteTransaction(t.id)}
                            className="p-2 text-slate-200 dark:text-slate-700 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="py-16 text-center bg-white dark:bg-slate-900/80 rounded-[32px] border border-slate-100 dark:border-slate-800">
                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <History size={40} className="text-slate-200 dark:text-slate-700" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 dark:text-slate-500">No transactions found</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </section>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 z-40 px-6 py-3">
        <div className="max-w-md mx-auto flex items-center justify-around">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              activeTab === 'dashboard' ? "text-indigo-600" : "text-slate-400 dark:text-slate-600"
            )}
          >
            <PieChartIcon size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest">Dashboard</span>
          </button>
          
          <div className="relative -top-8">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsModalOpen(true)}
              className="w-14 h-14 gradient-balance text-white rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-200 dark:shadow-none border-4 border-white dark:border-slate-950"
            >
              <Plus size={32} />
            </motion.button>
          </div>

          <button 
            onClick={() => setActiveTab('transactions')}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              activeTab === 'transactions' ? "text-indigo-600" : "text-slate-400 dark:text-slate-600"
            )}
          >
            <History size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest">Transactions</span>
          </button>
        </div>
      </nav>

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[40px] p-8 relative z-10 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto mb-8" />
              
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">New Transaction</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAddTransaction} className="space-y-8">
                {/* Type Selector */}
                <div className="flex p-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setType('expense');
                      setCategory(CATEGORIES.find(c => c.type === 'expense')?.id || '');
                    }}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                      type === 'expense' ? "bg-white dark:bg-slate-700 text-rose-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setType('income');
                      setCategory(CATEGORIES.find(c => c.type === 'income')?.id || '');
                    }}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                      type === 'income' ? "bg-white dark:bg-slate-700 text-emerald-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Income
                  </button>
                </div>

                {/* Amount Input */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Amount</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-slate-300 dark:text-slate-700">{CURRENCY_SYMBOL}</span>
                    <input 
                      type="number" 
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-800 rounded-3xl py-6 pl-14 pr-6 text-4xl font-black text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-200 dark:placeholder:text-slate-700"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Category Selector */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Category</label>
                  <div className="grid grid-cols-4 gap-3">
                    {CATEGORIES.filter(c => c.type === type).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={cn(
                          "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all",
                          category === cat.id 
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30" 
                            : "border-transparent bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
                        )}
                      >
                        <div 
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
                          style={{ backgroundColor: cat.color }}
                        >
                          <Receipt size={20} />
                        </div>
                        <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 truncate w-full text-center uppercase tracking-tighter">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Description</label>
                  <input 
                    type="text" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What was this for?"
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-800 rounded-2xl py-4 px-6 text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full py-5 gradient-balance text-white rounded-3xl font-black text-lg shadow-xl shadow-indigo-100 active:scale-[0.98] transition-all"
                >
                  Save Transaction
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Savings Goal Modal */}
      <AnimatePresence>
        {isGoalModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsGoalModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[40px] p-8 relative z-10 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto mb-8" />
              
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {editingGoalId ? 'Edit Goal' : 'New Savings Goal'}
                </h2>
                <button onClick={() => setIsGoalModalOpen(false)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAddGoal} className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Goal Name</label>
                  <input 
                    type="text" 
                    value={goalName}
                    onChange={(e) => setGoalName(e.target.value)}
                    placeholder="e.g., New Car, Vacation"
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-800 rounded-2xl py-4 px-6 text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Target Amount</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{CURRENCY_SYMBOL}</span>
                      <input 
                        type="number" 
                        value={goalTarget}
                        onChange={(e) => setGoalTarget(e.target.value)}
                        placeholder="0"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-800 rounded-2xl py-4 pl-10 pr-4 text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Current Saved</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{CURRENCY_SYMBOL}</span>
                      <input 
                        type="number" 
                        value={goalCurrent}
                        onChange={(e) => setGoalCurrent(e.target.value)}
                        placeholder="0"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-800 rounded-2xl py-4 pl-10 pr-4 text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full py-5 gradient-balance text-white rounded-3xl font-black text-lg shadow-xl shadow-indigo-100 active:scale-[0.98] transition-all"
                >
                  {editingGoalId ? 'Update Goal' : 'Create Goal'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Budget Modal */}
      <AnimatePresence>
        {isBudgetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBudgetModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[40px] p-8 relative z-10 shadow-2xl overflow-y-auto max-h-[80vh]"
            >
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto mb-8" />
              
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Monthly Budgets</h2>
                <button onClick={() => setIsBudgetModalOpen(false)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {CATEGORIES.filter(c => c.type === 'expense').map((cat) => (
                  <div key={cat.id} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                        style={{ backgroundColor: cat.color }}
                      >
                        <Receipt size={16} />
                      </div>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{cat.name}</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{CURRENCY_SYMBOL}</span>
                      <input 
                        type="number" 
                        value={budgets[cat.id] || ''}
                        onChange={(e) => handleSetBudget(cat.id, e.target.value)}
                        placeholder="Set limit"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-800 rounded-2xl py-3 pl-10 pr-4 text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                      />
                    </div>
                  </div>
                ))}

                <button 
                  onClick={() => setIsBudgetModalOpen(false)}
                  className="w-full py-4 gradient-balance text-white rounded-3xl font-black text-lg shadow-xl shadow-indigo-100 active:scale-[0.98] transition-all"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Export Modal */}
      <AnimatePresence>
        {isExportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExportModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[40px] p-8 relative z-10 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto mb-8" />
              
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Export Data</h2>
                <button onClick={() => setIsExportModalOpen(false)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Start Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="date" 
                      value={exportStartDate}
                      onChange={(e) => setExportStartDate(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">End Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="date" 
                      value={exportEndDate}
                      onChange={(e) => setExportEndDate(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>

                <div className="bg-indigo-50 dark:bg-indigo-950/30 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
                  <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1">Export Format</p>
                  <p className="text-xs font-medium text-indigo-900 dark:text-indigo-200 opacity-80">Data will be exported as a CSV file compatible with Excel and Google Sheets.</p>
                </div>

                <button 
                  onClick={handleExportCSV}
                  className="w-full py-5 gradient-balance text-white rounded-3xl font-black text-lg shadow-xl shadow-indigo-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Download size={20} />
                  Download CSV
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[40px] p-8 relative z-10 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto mb-8" />
              
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Settings</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Profile Section */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-[32px] border border-slate-100 dark:border-slate-700 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white dark:border-slate-600 shadow-md">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="Profile" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-indigo-500 flex items-center justify-center text-xl text-white font-bold">
                        {user.displayName?.charAt(0) || 'U'}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">{user.displayName}</h3>
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500">{user.email}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2">Tools & Data</h4>
                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[24px] overflow-hidden">
                    <button 
                      onClick={() => {
                        setIsSettingsOpen(false);
                        setIsBudgetModalOpen(true);
                      }}
                      className="w-full p-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-50 dark:border-slate-800"
                    >
                      <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                        <Target size={20} className="text-indigo-500" />
                        <span className="text-sm font-bold">Set Budgets</span>
                      </div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </button>
                    <button 
                      onClick={() => {
                        setIsSettingsOpen(false);
                        setIsExportModalOpen(true);
                      }}
                      className="w-full p-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                        <Download size={20} className="text-slate-400" />
                        <span className="text-sm font-bold">Export CSV</span>
                      </div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2">Preferences</h4>
                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[24px] overflow-hidden">
                    <button 
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className="w-full p-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-50 dark:border-slate-800"
                    >
                      <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                        <span className="text-sm font-bold">Dark Mode</span>
                      </div>
                      <div className={cn(
                        "w-10 h-5 rounded-full relative transition-colors",
                        isDarkMode ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"
                      )}>
                        <motion.div 
                          animate={{ x: isDarkMode ? 20 : 2 }}
                          className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                        />
                      </div>
                    </button>
                    <div className="w-full p-5 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                        <Coins size={20} />
                        <span className="text-sm font-bold">Currency</span>
                      </div>
                      <span className="text-xs font-black text-slate-400">{CURRENCY_SYMBOL} (INR)</span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    logout();
                    setIsSettingsOpen(false);
                  }}
                  className="w-full py-5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-3xl font-black text-sm flex items-center justify-center gap-2 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-all"
                >
                  <TrendingDown size={18} />
                  Sign Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
