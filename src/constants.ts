import { Category } from './types';

export const CATEGORIES: Category[] = [
  { id: 'salary', name: 'Salary', icon: 'Wallet', color: '#10b981', type: 'income' },
  { id: 'freelance', name: 'Freelance', icon: 'Laptop', color: '#3b82f6', type: 'income' },
  { id: 'investment', name: 'Investment', icon: 'TrendingUp', color: '#8b5cf6', type: 'income' },
  { id: 'food', name: 'Food & Dining', icon: 'Utensils', color: '#ef4444', type: 'expense' },
  { id: 'rent', name: 'Rent', icon: 'Home', color: '#f59e0b', type: 'expense' },
  { id: 'shopping', name: 'Shopping', icon: 'ShoppingBag', color: '#ec4899', type: 'expense' },
  { id: 'transport', name: 'Transport', icon: 'Car', color: '#06b6d4', type: 'expense' },
  { id: 'entertainment', name: 'Entertainment', icon: 'Film', color: '#8b5cf6', type: 'expense' },
  { id: 'health', name: 'Health', icon: 'HeartPulse', color: '#10b981', type: 'expense' },
  { id: 'other', name: 'Other', icon: 'Plus', color: '#64748b', type: 'expense' },
];

export const CURRENCY_SYMBOL = '₹';
