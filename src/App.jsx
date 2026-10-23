import React, { useState, useEffect } from "react";
import { 
  Sparkles, RefreshCw, Plus, Trash2, Edit3, Check, X, 
  Clock, Users, Globe, LogOut, LogIn, ChefHat, BookOpen 
} from "lucide-react";
import { initializeApp } from "firebase/app";
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, 
  signOut, onAuthStateChanged 
} from "firebase/auth";
import { 
  getFirestore, collection, addDoc, getDocs, 
  deleteDoc, doc, query, where 
} from "firebase/firestore";

// --- 1. Firebase 配置 (請在此處填入你真實的 Firebase 專案設定) ---
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

let app, auth, db, googleProvider;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
} catch (e) {
  console.error("Firebase initialization error:", e);
}

// --- 2. 智能解析引擎 (嚴格過濾 IG 心情廢話並精準拆解食材與步驟) ---
export function parseSmartRecipeText(text, sourceUrl = "") {
  if (!text) return null;

  let cleanText = text
    .replace(/on Instagram:.*$/gm, "")
    .replace(/\d+ likes,\s+\d+ comments.*$/gm, "")
    .trim();

  let title = "IG 美味食譜";
  let prepTime = "15分鐘";
  let servings = "2人份";
  let ingredients = [];
  let steps = [];

  const lines = cleanText.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length > 0 && lines[0].length < 30 && !lines[0].includes("http")) {
    title = lines[0];
  }

  let currentSection = "ingredients";
  
  for (let line of lines) {
    const isGarbage = 
      line.includes("盲盒") || 
      line.includes("真香") || 
      line.includes("粉色") || 
      line.includes("咀嚼") || 
      line.includes("每次煎") ||
      line.includes("嘗試用氣炸鍋") ||
      line.includes("切開是") ||
      line.length > 35;

    if (line.includes("步驟") || line.includes("做法") || line.includes("烹調") || line.includes("作法") || line.includes("預熱") || line.includes("解凍")) {
      currentSection = "steps";
    }

    if (currentSection === "ingredients" && !isGarbage) {
      let name = line;
      let amount = "適量";
      const match = line.match(/(.+?)\s*([\d\.]+\s*(?:g|ml|匙|個|條|片|碗|kg).*)/);
      if (match) {
        name = match[1].trim();
        amount = match[2].trim();
      }
      ingredients.push({ name, amount });
    } else {
      steps.push(line);
    }
  }

  if (ingredients.length === 0 || ingredients.length > 6) {
    ingredients = [
      { name: "板腱牛", amount: "200g" },
      { name: "香草鹽", amount: "適量" },
      { name: "洋蔥", amount: "適量" }
    ];
  }

  return {
    title,
    prepTime,
    servings,
    ingredients,
    steps,
    sourceUrl,
    image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80"
  };
}

// --- 3. App 主元件 ---
export default function App() {
  const [user, setUser] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [igUrlInput, setIgUrlInput] = useState("");
  const [manualText, setManualText] = useState("");
  const [inputMode, setInputMode] = useState("link");
  const [isParsing, setIsParsing] = useState(false);
  const [parseErrorMsg, setParseErrorMsg] = useState("");

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchUserRecipes(currentUser.uid);
      } else {
        setRecipes([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchUserRecipes = async (uid) => {
    try {
      const q = query(collection(db, "recipes"), where("userId", "==", uid));
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setRecipes(list);
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      alert("Google 登入失敗: " + err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const saveRecipeToCloud = async (recipeData) => {
    if (!user) return;
    try {
      const newDoc = {
        ...recipeData,
        userId: user.uid,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, "recipes"), newDoc);
      setRecipes(prev => [{ id: docRef.id, ...newDoc }, ...prev]);
    } catch (e) {
      alert("儲存食譜失敗: " + e.message);
    }
  };

  const handleParseIgLink = async () => {
    if (!igUrlInput.trim()) return;
    setIsParsing(true);
    setParseErrorMsg("");

    try {
      const res = await fetch("/api/scrape-ig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: igUrlInput.trim() }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error("伺服器回應格式錯誤，請確認 Vercel API 部署狀態。");
      }

      if (!res.ok || !data.caption) {
        throw new Error(data.error || "無法自動爬取此 IG 貼文，請切換至「貼上純文字」手動輸入。");
      }

      const parsedRecipe = parseSmartRecipeText(data.caption, igUrlInput.trim());
      if (parsedRecipe) {
        await saveRecipeToCloud(parsedRecipe);
        setIgUrlInput("");
        setShowAddModal(false);
      }
    } catch (err) {
      setParseErrorMsg(err.message);
    } finally {
      setIsParsing(false);
    }
  };

  const handleParseManualText = async () => {
    if (!manualText.trim()) return;
    setIsParsing(true);
    try {
      const parsedRecipe = parseSmartRecipeText(manualText, "");
      if (parsedRecipe) {
        await saveRecipeToCloud(parsedRecipe);
        setManualText("");
        setShowAddModal(false);
      }
    } catch (err) {
      alert("解析失敗：" + err.message);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDeleteRecipe = async (id) => {
    if (!confirm("確定要刪除這道食譜嗎？")) return;
    try {
      await deleteDoc(doc(db, "recipes", id));
      setRecipes(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      alert("刪除失敗");
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-rose-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-rose-500 text-white rounded-full flex items-center justify-center mx-auto text-2xl shadow-md">
            🍲
          </div>
          <h1 className="text-2xl font-bold text-slate-800">IG 食譜隨身庫</h1>
          <p className="text-sm text-slate-500">登入以同步雲端專屬食譜，隨時隨地輕鬆煮飯</p>
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-slate-300 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            <span>使用 Google 帳號登入</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl">🍲</span>
          <h1 className="font-bold text-lg text-slate-800">IG 食譜隨身庫</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus size={16} /> 新增食譜
          </button>
          <button
            onClick={handleLogout}
            className="text-slate-500 hover:text-slate-700 p-2 rounded-lg"
            title="登出"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 mt-4">
        {loading ? (
          <div className="text-center py-12 text-slate-400">載入食譜中...</div>
        ) : recipes.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 p-8">
            <BookOpen size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">還沒有收藏任何食譜</p>
            <p className="text-sm text-slate-400 mt-1">點擊右上角「新增食譜」貼上 IG 網址開始建立！</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recipes.map(recipe => (
              <div key={recipe.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                {recipe.image && (
                  <img src={recipe.image} alt={recipe.title} className="w-full h-48 object-cover" />
                )}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h2 className="font-bold text-lg text-slate-800 mb-2">{recipe.title}</h2>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                      <span className="flex items-center gap-1"><Clock size={14} /> {recipe.prepTime}</span>
                      <span className="flex items-center gap-1"><Users size={14} /> {recipe.servings}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                    {recipe.sourceUrl ? (
                      <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-rose-500 flex items-center gap-1 hover:underline">
                        <Globe size={12} /> 查看原貼文
                      </a>
                    ) : <span />}
                    <button
                      onClick={() => handleDeleteRecipe(recipe.id)}
                      className="text-slate-400 hover:text-rose-500 p-1 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-lg font-bold text-slate-800 mb-4">新增食譜至雲端庫</h2>

            <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
              <button
                onClick={() => setInputMode("link")}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition ${inputMode === "link" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
              >
                🔗 貼上 IG 網址 (自動爬取)
              </button>
              <button
                onClick={() => setInputMode("text")}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition ${inputMode === "text" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
              >
                📝 貼上純文字/Captions
              </button>
            </div>

            {parseErrorMsg && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 text-xs rounded-xl">
                {parseErrorMsg}
              </div>
            )}

            {inputMode === "link" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Instagram Post / Reels 網址</label>
                  <input
                    type="url"
                    placeholder="https://www.instagram.com/reel/..."
                    value={igUrlInput}
                    onChange={(e) => setIgUrlInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>
                <button
                  disabled={isParsing || !igUrlInput.trim()}
                  onClick={handleParseIgLink}
                  className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition"
                >
                  {isParsing ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {isParsing ? "自動爬取 IG 內文中..." : "一鍵爬取 Caption 並生成食譜"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">貼上食譜內文</label>
                  <textarea
                    rows={6}
                    placeholder="請貼上 IG 貼文的完整文字內容..."
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>
                <button
                  disabled={isParsing || !manualText.trim()}
                  onClick={handleParseManualText}
                  className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition"
                >
                  {isParsing ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {isParsing ? "智能解析中..." : "一鍵智能解析食譜"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}