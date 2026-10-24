import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Utensils, 
  PlusCircle, 
  BookOpen, 
  LogOut, 
  Trash2, 
  Edit3, 
  Sparkles, 
  Link as LinkIcon, 
  FileText, 
  ArrowLeft,
  Clock,
  Tag
} from 'lucide-react';

// ==================== 1. FIREBASE 設定 ====================
const firebaseConfig = {
  apiKey: "AIzaSyCJrs8jjD7P64Z9F0gaZ30X88FCuKTpNV4",
  authDomain: "recipesaverapp-20f37.firebaseapp.com",
  projectId: "recipesaverapp-20f37",
  storageBucket: "recipesaverapp-20f37.firebasestorage.app",
  messagingSenderId: "862854229626",
  appId: "1:862854229626:web:62b0f9103934a4388955c3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==================== 2. GEMINI API 設定 ====================
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [currentView, setCurrentView] = useState('list');
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [inputType, setInputType] = useState('link');
  const [inputContent, setInputContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        fetchRecipes(currentUser.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchRecipes = async (uid) => {
    try {
      const q = query(collection(db, "recipes"), where("userId", "==", uid));
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setRecipes(list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    } catch (error) {
      console.error("讀取食譜失敗:", error);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setRecipes([]);
    setCurrentView('list');
  };

  const handleGenerateRecipe = async () => {
    if (!inputContent.trim()) {
      alert("請輸入 IG 連結或貼上食譜文字！");
      return;
    }

    setIsGenerating(true);
    try {
      const prompt = `
你是一個專業的食譜解析 AI。請將以下內容解析成完整的食譜結構。
注意：**所有輸出（包括菜名、食材名稱、步驟、標籤等）必須全部為繁體中文**。

內容：
${inputContent}

請嚴格按照以下 JSON 格式回傳，不要包含額外的 Markdown 標記（如 \`\`\`json）：
{
  "title": "菜名",
  "prepTime": "準備時間",
  "servings": "份量",
  "ingredients": [
    { "name": "食材名稱", "amount": "份量" }
  ],
  "steps": [
    "烹飪步驟 1",
    "烹飪步驟 2"
  ],
  "tags": ["標籤1", "標籤2"]
}
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const data = await response.json();
      const textResult = data.candidates[0].content.parts[0].text;
      const cleanJsonStr = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedRecipe = JSON.parse(cleanJsonStr);

      setSelectedRecipe({
        ...parsedRecipe,
        originalInput: inputContent,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setIsEditing(true);
      setCurrentView('detail');
    } catch (error) {
      console.error("AI 生成食譜失敗:", error);
      alert("AI 生成食譜失敗，請檢查 API Key 或輸入內容！");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveRecipe = async () => {
    try {
      if (selectedRecipe.id) {
        const docRef = doc(db, "recipes", selectedRecipe.id);
        await updateDoc(docRef, {
          title: selectedRecipe.title,
          prepTime: selectedRecipe.prepTime,
          servings: selectedRecipe.servings,
          ingredients: selectedRecipe.ingredients,
          steps: selectedRecipe.steps,
          tags: selectedRecipe.tags
        });
      } else {
        const docRef = await addDoc(collection(db, "recipes"), {
          ...selectedRecipe,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
        setSelectedRecipe({ ...selectedRecipe, id: docRef.id });
      }
      alert("食譜儲存成功！");
      setIsEditing(false);
      fetchRecipes(user.uid);
      setCurrentView('list');
    } catch (error) {
      console.error("儲存失敗:", error);
      alert("儲存失敗");
    }
  };

  const handleDeleteRecipe = async (id) => {
    if (confirm("確定要刪除這道食譜嗎？")) {
      try {
        await deleteDoc(doc(db, "recipes", id));
        fetchRecipes(user.uid);
        setCurrentView('list');
      } catch (error) {
        console.error("刪除失敗:", error);
      }
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-orange-50 text-orange-600 font-medium">載入中...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
          <div className="text-center mb-8">
            <div className="bg-orange-500 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-white shadow-lg mb-4">
              <Utensils size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">IG 食譜管家</h1>
            <p className="text-sm text-gray-500 mt-1">一鍵儲存、智慧生成專屬你的繁中食譜庫</p>
          </div>

          {authError && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{authError}</div>}

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">電子郵件</label>
              <input 
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" placeholder="name@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">密碼</label>
              <input 
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" placeholder="••••••••"
              />
            </div>
            <button type="submit" className="w-full py-3 bg-orange-500 text-white rounded-lg font-semibold shadow-md hover:bg-orange-600 transition">
              {authMode === 'login' ? '登入系統' : '註冊帳號'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="text-sm text-orange-600 hover:underline">
              {authMode === 'login' ? '沒有帳號？點此註冊' : '已有帳號？返回登入'}
            </button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400">或者</span></div>
          </div>

          <button onClick={handleGoogleLogin} className="w-full py-3 border border-gray-300 rounded-lg font-medium text-gray-700 flex items-center justify-center gap-2 hover:bg-gray-50 transition">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            使用 Google 帳號登入
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-20 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('list')}>
          <div className="bg-orange-500 text-white p-2 rounded-xl"><Utensils size={24} /></div>
          <span className="font-bold text-xl text-gray-800">IG 食譜管家</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { setInputContent(''); setCurrentView('add'); }} className="bg-orange-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-orange-600 transition shadow-sm">
            <PlusCircle size={18} /> 新增食譜
          </button>
          <button onClick={handleLogout} className="text-gray-500 hover:text-red-600 p-2 rounded-lg transition" title="登出">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6">
        {currentView === 'list' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">我的食譜收藏庫 ({recipes.length})</h2>
            </div>
            {recipes.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
                <BookOpen size={48} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">還沒有收藏任何食譜</p>
                <button onClick={() => setCurrentView('add')} className="mt-4 text-orange-500 font-semibold hover:underline">立即新增第一個食譜</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recipes.map((recipe) => (
                  <div key={recipe.id} onClick={() => { setSelectedRecipe(recipe); setIsEditing(false); setCurrentView('detail'); }} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800 mb-2">{recipe.title}</h3>
                      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                        {recipe.prepTime && <span className="flex items-center gap-1"><Clock size={14}/> {recipe.prepTime}</span>}
                        {recipe.servings && <span className="flex items-center gap-1"><Utensils size={14}/> {recipe.servings}</span>}
                      </div>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {recipe.tags?.map((tag, idx) => (
                          <span key={idx} className="bg-orange-50 text-orange-600 text-xs px-2 py-0.5 rounded-md flex items-center gap-1"><Tag size={10} /> {tag}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 pt-3 border-t border-gray-50 flex justify-between items-center">
                      <span>點擊檢視完整食譜</span>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe.id); }} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentView === 'add' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <button onClick={() => setCurrentView('list')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-4 text-sm font-medium">
              <ArrowLeft size={16} /> 返回食譜列表
            </button>
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <Sparkles className="text-orange-500" /> AI 自動生成食譜
            </h2>
            <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
              <button onClick={() => setInputType('link')} className={`flex-1 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition ${inputType === 'link' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500'}`}>
                <LinkIcon size={16} /> IG 貼文/Reels 連結
              </button>
              <button onClick={() => setInputType('text')} className={`flex-1 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition ${inputType === 'text' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500'}`}>
                <FileText size={16} /> 複製貼上文字
              </button>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {inputType === 'link' ? '請輸入 Instagram 貼文或 Reels 連結' : '請貼上食譜或文章文字'}
              </label>
              <textarea 
                rows={6} value={inputContent} onChange={(e) => setInputContent(e.target.value)}
                placeholder={inputType === 'link' ? 'https://www.instagram.com/p/...' : '請將食譜文字完整貼上在這裡...'}
                className="w-full p-4 border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
              />
            </div>
            <button onClick={handleGenerateRecipe} disabled={isGenerating} className="w-full py-3.5 bg-orange-500 text-white rounded-xl font-semibold shadow-md hover:bg-orange-600 transition flex items-center justify-center gap-2 disabled:bg-orange-300">
              {isGenerating ? 'AI 正在為你解析食譜中...' : '✨ 開始生成完整食譜'}
            </button>
          </div>
        )}

        {currentView === 'detail' && selectedRecipe && (
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <button onClick={() => setCurrentView('list')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium">
                <ArrowLeft size={16} /> 返回列表
              </button>
              <div>
                {isEditing ? (
                  <button onClick={handleSaveRecipe} className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-green-700 transition">儲存變更</button>
                ) : (
                  <button onClick={() => setIsEditing(true)} className="bg-orange-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1 hover:bg-orange-600 transition">
                    <Edit3 size={16} /> 手動修改
                  </button>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">菜名</label>
                  <input type="text" value={selectedRecipe.title} onChange={(e) => setSelectedRecipe({...selectedRecipe, title: e.target.value})} className="w-full text-xl font-bold p-2 border rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">準備時間</label>
                    <input type="text" value={selectedRecipe.prepTime || ''} onChange={(e) => setSelectedRecipe({...selectedRecipe, prepTime: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">份量</label>
                    <input type="text" value={selectedRecipe.servings || ''} onChange={(e) => setSelectedRecipe({...selectedRecipe, servings: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900 mb-3">{selectedRecipe.title}</h1>
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                  {selectedRecipe.prepTime && <span className="flex items-center gap-1"><Clock size={16}/> 準備時間: {selectedRecipe.prepTime}</span>}
                  {selectedRecipe.servings && <span className="flex items-center gap-1"><Utensils size={16}/> 份量: {selectedRecipe.servings}</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedRecipe.tags?.map((tag, idx) => (
                    <span key={idx} className="bg-orange-50 text-orange-600 text-xs px-2.5 py-1 rounded-md font-medium">#{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-800 mb-3 pb-2 border-b">食材清單</h3>
              {isEditing ? (
                <div className="space-y-2">
                  {selectedRecipe.ingredients?.map((ing, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input type="text" value={ing.name} placeholder="食材名稱" onChange={(e) => {
                        const newIngs = [...selectedRecipe.ingredients];
                        newIngs[idx].name = e.target.value;
                        setSelectedRecipe({...selectedRecipe, ingredients: newIngs});
                      }} className="flex-1 p-2 border rounded-lg text-sm" />
                      <input type="text" value={ing.amount} placeholder="份量" onChange={(e) => {
                        const newIngs = [...selectedRecipe.ingredients];
                        newIngs[idx].amount = e.target.value;
                        setSelectedRecipe({...selectedRecipe, ingredients: newIngs});
                      }} className="w-32 p-2 border rounded-lg text-sm" />
                      <button onClick={() => {
                        const newIngs = selectedRecipe.ingredients.filter((_, i) => i !== idx);
                        setSelectedRecipe({...selectedRecipe, ingredients: newIngs});
                      }} className="text-red-500 p-2 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                    </div>
                  ))}
                  <button onClick={() => {
                    const newIngs = [...(selectedRecipe.ingredients || []), { name: '', amount: '' }];
                    setSelectedRecipe({...selectedRecipe, ingredients: newIngs});
                  }} className="text-sm text-orange-600 font-semibold mt-2">+ 新增食材</button>
                </div>
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {selectedRecipe.ingredients?.map((ing, idx) => (
                    <li key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg text-sm">
                      <span className="font-medium text-gray-800">{ing.name}</span>
                      <span className="text-orange-600 font-semibold">{ing.amount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-800 mb-3 pb-2 border-b">烹飪步驟</h3>
              {isEditing ? (
                <div className="space-y-3">
                  {selectedRecipe.steps?.map((step, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <span className="bg-orange-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-2 flex-shrink-0">{idx + 1}</span>
                      <textarea rows={2} value={step} onChange={(e) => {
                        const newSteps = [...selectedRecipe.steps];
                        newSteps[idx] = e.target.value;
                        setSelectedRecipe({...selectedRecipe, steps: newSteps});
                      }} className="flex-1 p-2 border rounded-lg text-sm" />
                      <button onClick={() => {
                        const newSteps = selectedRecipe.steps.filter((_, i) => i !== idx);
                        setSelectedRecipe({...selectedRecipe, steps: newSteps});
                      }} className="text-red-500 p-2 hover:bg-red-50 rounded-lg mt-1"><Trash2 size={18} /></button>
                    </div>
                  ))}
                  <button onClick={() => {
                    const newSteps = [...(selectedRecipe.steps || []), ''];
                    setSelectedRecipe({...selectedRecipe, steps: newSteps});
                  }} className="text-sm text-orange-600 font-semibold mt-2">+ 新增步驟</button>
                </div>
              ) : (
                <ol className="space-y-4">
                  {selectedRecipe.steps?.map((step, idx) => (
                    <li key={idx} className="flex gap-4 items-start text-sm">
                      <span className="bg-orange-100 text-orange-600 w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0 mt-0.5">{idx + 1}</span>
                      <p className="text-gray-700 leading-relaxed pt-0.5">{step}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}