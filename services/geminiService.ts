import { GoogleGenAI } from "@google/genai";
import { Transaction, Goal } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function getFinancialInsights(transactions: Transaction[], budgets: Record<string, number> = {}, goals: Goal[] = []) {
  if (transactions.length === 0) return null;

  const summary = transactions.reduce((acc, t) => {
    const key = `${t.type}_${t.category}`;
    acc[key] = (acc[key] || 0) + t.amount;
    return acc;
  }, {} as Record<string, number>);

  const prompt = `
    As a smart financial advisor for an Indian user, analyze these recent transactions and provide 3 short, actionable insights or tips.
    Format the response as a JSON array of objects with 'title', 'content', and 'type' (one of: 'tip', 'warning', 'positive').
    
    Transactions Summary (in ₹):
    ${JSON.stringify(summary, null, 2)}

    Monthly Budgets (in ₹):
    ${JSON.stringify(budgets, null, 2)}

    Savings Goals (in ₹):
    ${JSON.stringify(goals.map(g => ({ name: g.name, target: g.targetAmount, current: g.currentAmount })), null, 2)}
    
    Total Transactions: ${transactions.length}
    Current Date: ${new Date().toLocaleDateString()}
    
    Focus on Indian spending habits, saving tips, identifying patterns, budget adherence, and goal progress. Keep it encouraging and concise.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error fetching insights:", error);
    return null;
  }
}
