// ============================================================
// 德语单词训练器 - 完整脚本
// ============================================================

// ----------------------------- 1. 初始化存储实例 -----------------------------
// 创建两个独立的存储空间（就像两个不同的抽屉）
// wordsStore: 存放单词本（德语、中文）
// progressStore: 存放学习进度（每个单词背到哪了）
const wordsStore = localforage.createInstance({
    name: "GermanVocab",      // 数据库名字
    storeName: "words"        // 这个抽屉的名字
});

const progressStore = localforage.createInstance({
    name: "GermanVocab",
    storeName: "progress"
});

// ----------------------------- 2. 示例数据 -----------------------------
// 这是默认的单词列表，当用户第一次打开页面时自动导入
const sampleWords = [
    { id: "1", german: "der Tisch", chinese: "桌子", partOfSpeech: "der" },
    { id: "2", german: "die Lampe", chinese: "灯", partOfSpeech: "die" },
    { id: "3", german: "das Buch", chinese: "书", partOfSpeech: "das" },
    { id: "4", german: "der Stuhl", chinese: "椅子", partOfSpeech: "der" },
    { id: "5", german: "die Katze", chinese: "猫", partOfSpeech: "die" }
];

// ----------------------------- 3. 初始化数据（首次运行时执行）-----------------------------
async function initData() {
    // 检查 wordsStore 里是否已经有单词了
    const wordCount = await wordsStore.length();
    
    if (wordCount === 0) {
        console.log("📚 首次运行，正在导入示例单词...");
        
        // 循环把每个示例单词存进去
        for (const word of sampleWords) {
            await wordsStore.setItem(word.id, word);
            
            // 同时为每个单词初始化学习进度
                 // 为德译中模式创建进度
const progress_de2zh = {
    wordId: word.id,
    mode: "de2zh",
    easeFactor: 2.5,
    interval: 0,
    nextReview: Date.now(),
    stage: 0
};
await progressStore.setItem(`${word.id}_de2zh`, progress_de2zh);

// 为中译德模式创建进度
const progress_zh2de = {
    wordId: word.id,
    mode: "zh2de",
    easeFactor: 2.5,
    interval: 0,
    nextReview: Date.now(),
    stage: 0
};
await progressStore.setItem(`${word.id}_zh2de`, progress_zh2de);
        }
        
        console.log(`✅ 已导入 ${sampleWords.length} 个示例单词`);
    } else {
        console.log(`📖 已有 ${wordCount} 个单词，跳过初始化`);
    }
}

// ----------------------------- 4. 读取所有单词 -----------------------------
async function getAllWords() {
    const words = [];
    const keys = await wordsStore.keys();  // 获取所有单词的ID
    
    for (const key of keys) {
        const word = await wordsStore.getItem(key);
        words.push(word);  // 添加到数组
    }
    
    return words;
}

// ----------------------------- 5. 读取所有进度 -----------------------------
async function getAllProgress() {
    const progresses = [];
    const keys = await progressStore.keys();
    
    for (const key of keys) {
        const progress = await progressStore.getItem(key);
        progresses.push(progress);
    }
    
    return progresses;
}

// ----------------------------- 6. 获取今天需要复习的单词ID -----------------------------
async function getDueWordIds(mode) {
    const allProgress = await getAllProgress();
    const now = Date.now();
    const dueIds = [];
    
    for (const progress of allProgress) {
        if (progress.mode === mode && progress.nextReview<= now) {
            dueIds.push(progress.wordId);
        }
    }
    
    return dueIds;
}

// ----------------------------- 7. 更新单词的学习进度（SM-2算法简化版）-----------------------------
async function updateProgress(wordId, mode,quality) {
    // quality: 用户自评 0=完全忘记, 1=错误, 2=困难, 3=一般, 4=轻松, 5=完美
    const key = `${wordId}_${mode}`;  // 例如 "1_de2zh"
    const progress = await progressStore.getItem(key);
    if (!progress) return;
    
   // 从 progress 对象中取出当前的值
    let easeFactor = progress.easeFactor;
    let interval = progress.interval;
    let stage = progress.stage;
    
    // SM-2算法核心逻辑
    if (quality >= 3) {  // 回答正确
        if (stage === 0) {
            interval = 1;   // 第一次正确：1天后复习
        } else if (stage === 1) {
            interval = 6;   // 第二次正确：6天后复习
        } else {
            interval = Math.round(interval * easeFactor);  // 间隔递增
        }
        stage++;
    } else {  // 回答错误
        interval = 1;       // 重置为1天
        stage = 0;          // 打回新手村
        easeFactor = Math.max(1.3, easeFactor - 0.2);  // 降低易度因子
    }
    
    // 更新易度因子（回答越好增长越多）
    easeFactor = easeFactor + (0.1 - (5 - quality) * 0.08);
    easeFactor = Math.max(1.3, Math.min(2.5, easeFactor));
    
    // 计算下次复习时间
    const nextReview = Date.now() + interval * 24 * 3600 * 1000;
    
    // 保存更新后的进度
    const updatedProgress = {
       wordId: wordId,
        mode: mode,
        easeFactor: easeFactor,
        interval: interval,
        stage: stage,
        nextReview: nextReview
    };
    
    await progressStore.setItem(key, updatedProgress);
    console.log(`📊 更新进度: ${wordId}, 下次复习间隔: ${interval}天`);
}

// ----------------------------- 8. 全局变量（用于当前学习状态）-----------------------------
let currentWords = [];        // 当前需要复习的单词列表
let currentIndex = 0;         // 当前是第几个单词
let currentMode = "de2zh";    // 当前模式: de2zh=德译中, zh2de=中译德

// ----------------------------- 9. 加载今天的单词 -----------------------------
async function loadTodayWords() {
    const dueIds = await getDueWordIds(currentMode);
    const allWords = await getAllWords();
    
    // 过滤出需要复习的单词
    currentWords = allWords.filter(word => dueIds.includes(word.id));
    
    if (currentWords.length === 0) {
        document.getElementById("questionText").innerText = "🎉 今天没有新单词啦！";
        document.getElementById("stats").innerText = "今日待复习: 0 ✅";
        return false;
    }
    
    document.getElementById("stats").innerText = `今日待复习: ${currentWords.length}`;
    currentIndex = 0;
    displayCurrentWord();
    return true;
}

// ----------------------------- 10. 显示当前单词 -----------------------------
function displayCurrentWord() {
    if (currentWords.length === 0 || currentIndex >= currentWords.length) {
        document.getElementById("questionText").innerText = "恭喜！今日任务完成！";
        document.getElementById("answerInput").disabled = true;
        return;
    }
    
    const word = currentWords[currentIndex];
    const questionEl = document.getElementById("questionText");
    const feedbackEl = document.getElementById("feedback");
    const answerInput = document.getElementById("answerInput");
    
    // 清空输入框和反馈
    answerInput.value = "";
    feedbackEl.innerHTML = "等待你的答案...";
    answerInput.disabled = false;
    answerInput.focus();
    
    // 根据模式显示问题
    if (currentMode === "de2zh") {
        questionEl.innerHTML = word.german;
    } else {
        // 中译德模式：显示中文 + 词性提示
        questionEl.innerHTML = `${word.chinese} <span style="font-size:1rem;">(${word.partOfSpeech})</span>`;
    }
}

// ----------------------------- 11. 核对答案 -----------------------------
async function checkAnswer() {
    if (currentWords.length === 0 || currentIndex >= currentWords.length) {
        alert("没有单词可复习，请先导入词库或重置今日");
        return;
    }
    
    const word = currentWords[currentIndex];
    const userAnswer = document.getElementById("answerInput").value.trim();
    const feedbackEl = document.getElementById("feedback");
    
    let isCorrect = false;
    let correctAnswer = "";
    
    if (currentMode === "de2zh") {
        // 德译中：比较中文（简单匹配，不区分大小写和标点）
        correctAnswer = word.chinese;
        const normalizedUser = userAnswer.toLowerCase().replace(/[，,。？?！!；;：:、]/g, '');
        const normalizedCorrect = correctAnswer.toLowerCase().replace(/[，,。？?！!；;：:、]/g, '');
        isCorrect = normalizedUser === normalizedCorrect;
    } else {
        // 中译德：比较德语（忽略大小写，允许不带冠词）
        correctAnswer = word.german;
        const normalizedUser = userAnswer.toLowerCase().replace(/[.,!?;:]/g, '').trim();
        const normalizedCorrect = correctAnswer.toLowerCase().replace(/[.,!?;:]/g, '').trim();
        // 简单匹配：用户输入包含正确答案的主要部分（比如输入"tisch"匹配"der Tisch"）
        isCorrect = normalizedCorrect.includes(normalizedUser) || normalizedUser.includes(normalizedCorrect);
    }
    
    if (isCorrect) {
        feedbackEl.innerHTML = `✅ 正确！ ${correctAnswer}`;
        feedbackEl.style.backgroundColor = "#d4edda";
        // 回答正确：quality=4（轻松）
        await updateProgress(word.id, currentMode,4);
    } else {
        feedbackEl.innerHTML = `❌ 错误！ 正确答案是: ${correctAnswer}，你输入的是: ${userAnswer}`;
        feedbackEl.style.backgroundColor = "#f8d7da";
        // 回答错误：quality=0（完全忘记）
        await updateProgress(word.id, currentMode,0);
    }
    
    // 自动跳到下一个单词（1秒后）
    setTimeout(() => {
        nextWord();
    }, 1000);
}

// ----------------------------- 12. 下一个单词 -----------------------------
function nextWord() {
    if (currentIndex + 1 < currentWords.length) {
        currentIndex++;
        displayCurrentWord();
    } else {
        // 今日单词全部完成
        document.getElementById("questionText").innerText = "🎉 太棒了！今日任务完成！";
        document.getElementById("answerInput").disabled = true;
        document.getElementById("feedback").innerHTML = "明天再来复习吧～";
        document.getElementById("stats").innerText = `今日待复习: 0 ✅`;
        // 重新加载单词（明天会变）
        setTimeout(() => {
            loadTodayWords();
        }, 2000);
    }
}

// ----------------------------- 13. 重置今日（所有单词变成待复习）-----------------------------
async function resetToday() {
    const allProgress = await getAllProgress();
    for (const progress of allProgress) {
        progress.nextReview = Date.now();
        progress.interval = 0;
        progress.stage = 0;
        const key = `${progress.wordId}_${progress.mode}`;
        await progressStore.setItem(key, progress);
    }
    console.log("🔄 已重置所有单词的学习进度");
    await loadTodayWords();
}

// ----------------------------- 14. 导入词库（CSV/JSON）-----------------------------
function importWordList() {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];
    if (!file) {
        alert("请先选择一个文件");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const content = e.target.result;
        let words = [];
        
        try {
            if (file.name.endsWith(".json")) {
                words = JSON.parse(content);
            } else if (file.name.endsWith(".csv")) {
                // 简单CSV解析（每行格式: 德语,中文,词性）
                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    const parts = lines[i].split(",");
                    if (parts.length >= 2) {
                        words.push({
                            id: Date.now() + i + "",
                            german: parts[0].trim(),
                            chinese: parts[1].trim(),
                            partOfSpeech: parts[2]?.trim() || ""
                        });
                    }
                }
            }
            
            // 保存导入的单词
            for (const word of words) {
                await wordsStore.setItem(word.id, word);
                // 初始化进度
                const initialProgress = {
                    wordId: word.id,
                    easeFactor: 2.5,
                    interval: 0,
                    nextReview: Date.now(),
                    stage: 0
                };
                await progressStore.setItem(word.id, initialProgress);
            }
            
            document.getElementById("importStatus").innerHTML = `✅ 成功导入 ${words.length} 个单词`;
            await loadTodayWords();
        } catch (err) {
            document.getElementById("importStatus").innerHTML = `❌ 导入失败: ${err.message}`;
        }
    };
    reader.readAsText(file);
}

// ----------------------------- 15. 切换模式 -----------------------------
function setMode(mode) {
    currentMode = mode;
    // 更新按钮样式
    document.querySelectorAll(".mode-btn").forEach(btn => {
        if (btn.dataset.mode === mode) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    // 重新显示当前单词
    if (currentWords.length > 0 && currentIndex < currentWords.length) {
        displayCurrentWord();
    }
}

// ----------------------------- 16. 绑定按钮事件和页面启动 -----------------------------
async function main() {
    // 初始化数据
    await initData();
    
    // 加载今日单词
    await loadTodayWords();
    
    // 绑定按钮事件
    document.getElementById("checkBtn").onclick = checkAnswer;
    document.getElementById("nextBtn").onclick = nextWord;
    document.getElementById("resetBtn").onclick = resetToday;
    document.getElementById("fileInput").onchange = importWordList;
    
    // 绑定模式切换
    document.querySelectorAll(".mode-btn").forEach(btn => {
        btn.onclick = () => setMode(btn.dataset.mode);
    });
    
    console.log("🚀 应用已启动");
}

// 启动应用
main();