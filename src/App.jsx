import React, { useState, useEffect } from "react";
import { 
  Plus, Link, FileText, Utensils, Clock, Users, Search, Trash2, 
  ExternalLink, Bookmark, Edit3, X, Sparkles, ChefHat, Tag, Check, 
  RefreshCw, Heart, Share2, Filter, Flame, Camera, BookOpen, LogOut, User 
} from "lucide-react";
import { auth, googleProvider, db, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // 登入表單 State
  const [authMode, setAuthMode] = useState("login");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  // 食譜 State
  const [recipes, setRecipes] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  
  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);

  // 輸入 Mode
  const [inputMode, setInputMode] = useState("link");
  const [igUrlInput, setIgUrlInput] = useState("");
  const [rawTextInput, setRawTextInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parseErrorMsg, setParseErrorMsg] = useState("");

  // 監聽 User 登入狀態
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // 監聽雲端 Firestore 資料庫
  useEffect(() => {
    if (!currentUser) {
      setRecipes([]);
      return;
    }

    const q = query(
      collection(db, "recipes"),
      where("userId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedRecipes = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setRecipes(fetchedRecipes);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Google 登入
  const handleGoogleLogin = async () => {
    try {
      setAuthError("");
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError("Google 登入失敗：" + err.message);
    }
  };

  // 自訂 Email/Username 登入或註冊
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    const email = emailInput.includes("@") ? emailInput : `${emailInput}@recipeapp.local`;

    try {
      if (authMode === "register") {
        await createUserWithEmailAndPassword(auth, email, passwordInput);
      } else {
        await signInWithEmailAndPassword(auth, email, passwordInput);
      }
    } catch (err) {
      setAuthError(authMode === "register" ? "註冊失敗：密碼需至少6位數或帳號已存在" : "登入失敗：帳號或密碼錯誤");
    }
  };

  // 登出
  const handleLogout = () => {
    signOut(auth);
    setSelectedRecipe(null);
  };

  // 新增食譜至雲端
  const saveRecipeToCloud = async (newRecipeData) => {
    if (!currentUser) return;
    await addDoc(collection(db, "recipes"), {
      ...newRecipeData,
      userId: currentUser.uid,
      createdAt: new Date().toISOString()
    });
  };

  // 核心：超強純文字結構化解析引擎
  const parseSmartRecipeText = (text, sourceUrl = "") => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;

    let title = lines[0].replace(/^[#\*\s]+/, "");
    let category = "家常料理";
    let ingredients = [];
    let instructions = [];

    let mode = "HEADER";

    const ingredientKeywords = ["材料", "食材", "準備", "配料", "調味料", "ingredients", "seasoning"];
    const instructionKeywords = ["做法", "步驟", "製作方法", "烹飪步驟", "steps", "instructions", "method"];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();

      if (ingredientKeywords.some(kw => lowerLine.includes(kw)) && line.length < 20) {
        mode = "INGREDIENTS";
        continue;
      }
      if (instructionKeywords.some(kw => lowerLine.includes(kw)) && line.length < 20) {
        mode = "INSTRUCTIONS";
        continue;
      }

      if (/^(\d+[\.\、\s]|step\s*\d+)/i.test(line)) {
        mode = "INSTRUCTIONS";
      }

      if (mode === "INGREDIENTS" || (mode === "HEADER" && i > 0 && !/^(\d+|step)/i.test(line))) {
        const cleanLine = line.replace(/^[•\-\*\▪\▫\s]+/, "");
        const parts = cleanLine.split(/[:：\t]+|(?<=\S)\s{2,}|(?<=[\u4e00-\u9fa5a-zA-Z])\s+(?=[\d一二三四五六七八九十半適少])/);

        if (parts.length >= 2) {
          ingredients.push({ name: parts[0].trim(), amount: parts.slice(1).join(" ").trim() });
        } else {
          const lastSpaceIdx = cleanLine.lastIndexOf(" ");
          if (lastSpaceIdx > 0) {
            ingredients.push({
              name: cleanLine.substring(0, lastSpaceIdx).trim(),
              amount: cleanLine.substring(lastSpaceIdx + 1).trim()
            });
          } else {
            ingredients.push({ name: cleanLine, amount: "適量" });
          }
        }
      } else if (mode === "INSTRUCTIONS") {
        const cleanStep = line.replace(/^(\d+[\.\、\s]|step\s*\d+[:：\s]*)/i, "").trim();
        if (cleanStep) {
          instructions.push(cleanStep);
        }
      }
    }

    if (ingredients.length === 0) {
      ingredients = [{ name: "詳見內文食材說明", amount: "適量" }];
    }
    if (instructions.length === 0) {
      instructions = lines.slice(1).length > 0 ? lines.slice(1) : ["請參閱內文做法。"];
    }

    return {
      title: title.length > 30 ? title.substring(0, 30) + "..." : title,
      sourceUrl: sourceUrl,
      sourceType: sourceUrl ? "instagram" : "text",
      coverImage: "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=800&q=80",
      category,
      prepTime: "10分鐘",
      cookTime: "15分鐘",
      servings: 2,
      ingredients,
      instructions
    };
  };

  // 純文字解析匯入
  const handleParseText = async () => {
    if (!rawTextInput.trim()) return;
    setIsParsing(true);
    setParseErrorMsg("");

    try {
      const parsedRecipe = parseSmartRecipeText(rawTextInput);
      if (parsedRecipe) {
        await saveRecipeToCloud(parsedRecipe);
      }
      setRawTextInput("");
      setShowAddModal(false);
    } catch (err) {
      setParseErrorMsg("解析失敗：" + err.message);
    } finally {
      setIsParsing(false);
    }
  };

  // 自動爬取 IG 連結 Caption 並解析成食譜
  const handleParseIgLink = async () => {
    if (!igUrlInput.trim()) return;
    setIsParsing(true);
    setParseErrorMsg("");

    try {
      // 呼叫 Vercel API 爬取 Caption
      const res = await fetch("/api/scrape-ig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: igUrlInput.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.caption) {
        throw new Error(data.error || "無法自動爬取此 IG 貼文內容，請切換至「貼上純文字」手動複製。");
      }

      // 自動將抓取到的 Caption 傳給智能解析引擎
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

  // 食材編輯邏輯
  const handleIngredientChange = (index, field, value) => {
    const updated = [...editingRecipe.ingredients];
    updated[index][field] = value;
    setEditingRecipe({ ...editingRecipe, ingredients: updated });
  };

  const handleAddIngredient = () => {
    setEditingRecipe({
      ...editingRecipe,
      ingredients: [...(editingRecipe.ingredients || []), { name: "", amount: "" }]
    });
  };

  const handleRemoveIngredient = (index) => {
    const updated = editingRecipe.ingredients.filter((_, i) => i !== index);
    setEditingRecipe({ ...editingRecipe, ingredients: updated });
  };

  // 步驟編輯邏輯
  const handleInstructionChange = (index, value) => {
    const updated = [...editingRecipe.instructions];
    updated[index] = value;
    setEditingRecipe({ ...editingRecipe, instructions: updated });
  };

  const handleAddInstruction = () => {
    setEditingRecipe({
      ...editingRecipe,
      instructions: [...(editingRecipe.instructions || []), ""]
    });
  };

  const handleRemoveInstruction = (index) => {
    const updated = editingRecipe.instructions.filter((_, i) => i !== index);
    setEditingRecipe({ ...editingRecipe, instructions: updated });
  };

  // 儲存修改
  const handleUpdateRecipe = async (e) => {
    e.preventDefault();
    if (!editingRecipe?.id) return;

    const cleanIngredients = editingRecipe.ingredients.filter(i => i.name.trim() !== "");
    const cleanInstructions = editingRecipe.instructions.filter(i => i.trim() !== "");

    const recipeRef = doc(db, "recipes", editingRecipe.id);
    const updatedData = {
      title: editingRecipe.title,
      category: editingRecipe.category,
      cookTime: editingRecipe.cookTime,
      servings: editingRecipe.servings,
      ingredients: cleanIngredients,
      instructions: cleanInstructions
    };

    await updateDoc(recipeRef, updatedData);
    setSelectedRecipe({ ...editingRecipe, ingredients: cleanIngredients, instructions: cleanInstructions });
    setIsEditing(false);
  };

  // 刪除食譜
  const handleDeleteRecipe = async (id) => {
    if (confirm("確定要刪除呢個食譜嗎？")) {
      await deleteDoc(doc(db, "recipes", id));
      if (selectedRecipe?.id === id) setSelectedRecipe(null);
    }
  };

  const categories = ["All", ...Array.from(new Set(recipes.map((r) => r.category || "其他")))];

  const filteredRecipes = recipes.filter((recipe) => {
    const matchesSearch =
      recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.ingredients?.some((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === "All" || recipe.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        <RefreshCw className="animate-spin mr-2" size={20} /> 載入中...
      </div>
    );
  }

  // 未登入介面
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-xl border border-slate-200">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-rose-500 rounded-2xl flex items-center justify-center text-white mx-auto mb-3 shadow-md">
              <ChefHat size={28} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">IG 食譜隨身庫</h1>
            <p className="text-xs text-slate-500 mt-1">登入以同步並管理你嘅專屬食譜</p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 text-xs rounded-xl">
              {authError}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            className="w-full py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm rounded-xl transition-all flex items-center justify-center gap-2.5 mb-4 shadow-xs"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            使用 Google 帳號登入
          </button>

          <div className="relative flex py-2 items-center mb-4">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-slate-400 text-xs">或使用帳號密碼</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">用戶名 / Email</label>
              <input
                type="text"
                required
                placeholder="用戶名或 Email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">密碼</label>
              <input
                type="password"
                required
                placeholder="至少 6 位字元"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-medium text-sm rounded-xl transition-all shadow-xs mt-2"
            >
              {authMode === "login" ? "登入" : "註冊新帳號"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                setAuthError("");
              }}
              className="text-xs text-slate-500 hover:text-rose-500 underline"
            >
              {authMode === "login" ? "未有帳號？點此免費註冊" : "已有帳號？點此返回登入"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 已登入主介面
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-500 rounded-xl text-white shadow-xs">
              <ChefHat size={24} />
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-900 leading-tight">IG 食譜隨身庫</h1>
              <p className="text-xs text-slate-500">貼上 IG 網址自動爬取並生成食譜</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setShowAddModal(true);
                setParseErrorMsg("");
              }}
              className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white font-medium text-sm px-3.5 py-2 rounded-xl transition-all shadow-xs"
            >
              <Plus size={18} />
              新增食譜
            </button>

            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              title="登出帳號"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between items-stretch md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="搜尋標題或食材..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 shadow-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {filteredRecipes.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
            <BookOpen size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-base font-semibold text-slate-700">暫無食譜</h3>
            <p className="text-xs text-slate-400 mt-1">點擊右上角「新增食譜」貼上 IG 網址即可自動生成！</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredRecipes.map((recipe) => (
              <div
                key={recipe.id}
                onClick={() => {
                  setSelectedRecipe(recipe);
                  setEditingRecipe(JSON.parse(JSON.stringify(recipe)));
                }}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col group"
              >
                <div className="relative h-44 w-full bg-slate-100 overflow-hidden">
                  <img src={recipe.coverImage} alt={recipe.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  <span className="absolute top-3 left-3 bg-white/90 text-slate-800 font-medium text-xs px-2.5 py-1 rounded-md shadow-xs">
                    {recipe.category}
                  </span>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base mb-2 group-hover:text-rose-500 transition-colors line-clamp-1">
                      {recipe.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                      <div className="flex items-center gap-1">
                        <Clock size={14} />
                        <span>{recipe.cookTime || "15分鐘"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users size={14} />
                        <span>{recipe.servings || 2} 人份</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-xs text-slate-400 truncate max-w-[80%]">
                      {recipe.ingredients?.map((i) => i.name).join("、")}
                    </div>
                    <span className="text-xs text-rose-500 font-medium">查看 →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 詳細與完整手動編輯 Modal */}
      {selectedRecipe && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="relative h-48 w-full bg-slate-200 flex-shrink-0">
              <img src={selectedRecipe.coverImage} alt={selectedRecipe.title} className="w-full h-full object-cover" />
              <button
                onClick={() => {
                  setSelectedRecipe(null);
                  setIsEditing(false);
                }}
                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {!isEditing ? (
                <>
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-2xl font-bold text-slate-900">{selectedRecipe.title}</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingRecipe(JSON.parse(JSON.stringify(selectedRecipe)));
                          setIsEditing(true);
                        }}
                        className="p-2 text-slate-500 hover:text-rose-500 rounded-lg hover:bg-slate-100 flex items-center gap-1 text-xs font-medium"
                        title="手動修改食譜資料"
                      >
                        <Edit3 size={18} /> 編輯食譜
                      </button>
                      <button
                        onClick={() => handleDeleteRecipe(selectedRecipe.id)}
                        className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100"
                        title="刪除食譜"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 p-3.5 bg-slate-50 rounded-xl mb-6 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Clock size={18} className="text-rose-500" />
                      <span>烹調時間：<strong>{selectedRecipe.cookTime}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users size={18} className="text-rose-500" />
                      <span>份量：<strong>{selectedRecipe.servings} 人份</strong></span>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-2">
                      <Utensils size={18} className="text-rose-500" /> 食材清單
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedRecipe.ingredients?.map((item, idx) => (
                        <div key={idx} className="flex justify-between p-2.5 bg-slate-50 rounded-xl text-sm border border-slate-100">
                          <span>{item.name}</span>
                          <span className="font-semibold text-slate-500">{item.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-2">
                      <Flame size={18} className="text-rose-500" /> 烹飪步驟
                    </h3>
                    <div className="space-y-3">
                      {selectedRecipe.instructions?.map((step, idx) => (
                        <div key={idx} className="flex gap-3 text-sm text-slate-700">
                          <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-600 font-bold text-xs flex items-center justify-center flex-shrink-0">
                            {idx + 1}
                          </span>
                          <p>{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <form onSubmit={handleUpdateRecipe} className="space-y-5">
                  <div className="flex justify-between items-center border-b pb-3">
                    <h2 className="text-xl font-bold text-slate-900">修改食譜內容</h2>
                    <span className="text-xs text-slate-400">所有欄位均可修改</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">食譜標題</label>
                      <input
                        type="text"
                        required
                        value={editingRecipe.title}
                        onChange={(e) => setEditingRecipe({ ...editingRecipe, title: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">分類</label>
                        <input
                          type="text"
                          value={editingRecipe.category}
                          onChange={(e) => setEditingRecipe({ ...editingRecipe, category: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">烹調時間</label>
                        <input
                          type="text"
                          value={editingRecipe.cookTime}
                          onChange={(e) => setEditingRecipe({ ...editingRecipe, cookTime: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">份量 (人份)</label>
                        <input
                          type="number"
                          value={editingRecipe.servings}
                          onChange={(e) => setEditingRecipe({ ...editingRecipe, servings: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-2.5">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Utensils size={15} className="text-rose-500" /> 食材與份量修改
                      </label>
                      <button
                        type="button"
                        onClick={handleAddIngredient}
                        className="text-xs text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1 bg-rose-50 px-2.5 py-1 rounded-lg"
                      >
                        <Plus size={14} /> 新增食材
                      </button>
                    </div>

                    <div className="space-y-2">
                      {editingRecipe.ingredients?.map((ing, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="食材名稱"
                            value={ing.name}
                            onChange={(e) => handleIngredientChange(idx, "name", e.target.value)}
                            className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                          />
                          <input
                            type="text"
                            placeholder="份量"
                            value={ing.amount}
                            onChange={(e) => handleIngredientChange(idx, "amount", e.target.value)}
                            className="w-28 px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 rounded-md"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-2.5">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Flame size={15} className="text-rose-500" /> 烹飪步驟修改
                      </label>
                      <button
                        type="button"
                        onClick={handleAddInstruction}
                        className="text-xs text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1 bg-rose-50 px-2.5 py-1 rounded-lg"
                      >
                        <Plus size={14} /> 新增步驟
                      </button>
                    </div>

                    <div className="space-y-2">
                      {editingRecipe.instructions?.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="text-xs font-bold text-slate-400 mt-2">{idx + 1}.</span>
                          <textarea
                            rows={2}
                            value={step}
                            onChange={(e) => handleInstructionChange(idx, e.target.value)}
                            className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs leading-relaxed"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveInstruction(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 rounded-md mt-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-4 border-t sticky bottom-0 bg-white">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-medium"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-medium transition-all shadow-xs"
                    >
                      儲存所有修改
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 新增 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 text-base">新增食譜至雲端庫</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl mb-4">
                <button
                  onClick={() => setInputMode("link")}
                  className={`py-2 text-xs font-medium rounded-lg ${inputMode === "link" ? "bg-white shadow-xs" : "text-slate-500"}`}
                >
                  <Camera size={14} className="inline mr-1" />
                  貼上 IG 網址 (自動爬取)
                </button>
                <button
                  onClick={() => setInputMode("text")}
                  className={`py-2 text-xs font-medium rounded-lg ${inputMode === "text" ? "bg-white shadow-xs" : "text-slate-500"}`}
                >
                  <FileText size={14} className="inline mr-1" />
                  貼上純文字/Captions
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Instagram Post / Reels 網址
                    </label>
                    <input
                      type="url"
                      placeholder="https://www.instagram.com/reel/..."
                      value={igUrlInput}
                      onChange={(e) => setIgUrlInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                    />
                  </div>
                  <button
                    disabled={isParsing || !igUrlInput.trim()}
                    onClick={handleParseIgLink}
                    className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-200 text-white font-medium text-xs rounded-xl flex items-center justify-center gap-2"
                  >
                    {isParsing ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {isParsing ? "自動爬取 IG 內文中..." : "一鍵爬取 Caption 並生成食譜"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea
                    rows={7}
                    placeholder={`請直接複製 IG Post / Reel 嘅內文貼喺度：

例如：
日式蒜香牛舌燒肉丼
材料：
牛舌 250g
蒜蓉 1.5湯匙
蔥花 適量
做法：
1. 牛舌用廚房紙吸乾水分醃製5分鐘。
2. 大火熱鍋將牛舌炒至雙面金黃。
3. 倒入醬汁翻炒後鋪喺白飯上即可。`}
                    value={rawTextInput}
                    onChange={(e) => setRawTextInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                  <button
                    disabled={isParsing || !rawTextInput.trim()}
                    onClick={handleParseText}
                    className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-200 text-white font-medium text-xs rounded-xl flex items-center justify-center gap-2"
                  >
                    {isParsing ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {isParsing ? "智能分析中..." : "一鍵自動拆解食材與步驟"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
