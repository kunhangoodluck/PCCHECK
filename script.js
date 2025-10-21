// =================================================================
// === 在此貼上您的 FIREBASE 設定 (inventory-victory 專案) ===
// =================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCvki-pmq7oPg2nTHSvKuyj6uW5H4kDKRY",
  authDomain: "inventory-victory.firebaseapp.com",
  projectId: "inventory-victory",
  storageBucket: "inventory-victory.firebasestorage.app",
  messagingSenderId: "694559093161",
  appId: "1:694559093161:web:358cea5c18660a205d54b8"
};
// =================================================================

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const App = {
    // Vue 的資料中心
    data() {
        return {
            user: null,
            currentView: 'inventory',
            inventoryLog: [],
            newEntry: { // 盤點輸入的資料模型
                location: '',
                assetName: '',
                assetId: '', // 主要的、合併後的 ID
                assetIdPart1: '', // 分段 1
                assetIdPart2: '', // 分段 2
                assetIdPart3: ''  // 分段 3
            },
            showEditModal: false,
            editEntry: {}, // 編輯視窗的資料模型 (也需要分段)
            isLoadingOCR: false,
            imagePreviewUrl: '',
            csvData: [],
            uploadStatus: '',
            isComparing: false,
            comparisonResults: [],
            downloadFilter: 'log'
        }
    },
    // Vue 的方法 (功能) 中心
    methods: {
        // --- 登入/登出 ---
        login() {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch(error => console.error("登入失敗:", error));
        },
        logout() {
            auth.signOut();
        },
        // --- 日期格式化輔助 ---
        formatDate(timestamp) {
            return timestamp ? new Date(timestamp.toDate()).toLocaleString() : 'N/A';
        },

        // --- OCR 處理 (狙擊手級 v7) ---
        async handleFileUpload(event) {
            const file = event.target.files[0]; if (!file) return;
            this.isLoadingOCR = true; this.imagePreviewUrl = URL.createObjectURL(file); this.newEntry.assetId = ''; // 清空合併欄位觸發 watcher
            try {
                const { data } = await Tesseract.recognize(file, 'eng+chi_tra');
                let foundAssetId = null;
                const fullText = data.lines.map(line => line.text).join(' ');
                console.log("【鑑識報告】OCR 原始文字:", fullText);
                const regex = /(\d{7})[^\d]*(\d{2})[^\d]*(\d{7})/;
                const match = fullText.match(regex);
                if (match && match[1] && match[2] && match[3]) {
                    foundAssetId = `${match[1]}-${match[2]}-${match[3]}`;
                    console.log("DNA 結構匹配成功: " + foundAssetId);
                }
                if (foundAssetId) {
                    this.newEntry.assetId = foundAssetId; // 更新合併欄位，會觸發 watcher 自動拆分
                } else {
                    this.newEntry.assetId = '未辨識到指定格式'; // 更新合併欄位
                    console.log('DNA 結構匹配失敗，請手動輸入。');
                }
            } catch (error) { console.error('OCR 辨識失敗:', error); alert('圖片辨識失敗'); this.newEntry.assetId = '辨識錯誤'; }
            finally { this.isLoadingOCR = false; if(this.$refs.fileInput) this.$refs.fileInput.value = ''; }
        },

        // --- 分段輸入與合併/拆分 ---
        combineAssetId() {
            const p1 = String(this.newEntry.assetIdPart1 || '').trim();
            const p2 = String(this.newEntry.assetIdPart2 || '').trim();
            const p3 = String(this.newEntry.assetIdPart3 || '').trim();
            // 只有在所有部分都有內容時才組合
            if (p1 && p2 && p3) {
                 const combined = `${p1}-${p2}-${p3}`;
                 if (combined !== this.newEntry.assetId) {
                    this.newEntry.assetId = combined;
                }
            } else if (this.newEntry.assetId && !this.isLoadingOCR) { // 如果分段不完整，但合併欄位有值(且非OCR造成)，清空合併欄
                 // this.newEntry.assetId = ''; // 暫時移除，避免與 watcher 衝突
            }
        },
        splitAssetId(combinedId) {
             if (combinedId && typeof combinedId === 'string' && !this.isLoadingOCR) { // 確保 OCR 過程中不觸發反向拆分
                const parts = combinedId.split('-');
                if (parts.length === 3) {
                    this.newEntry.assetIdPart1 = parts[0];
                    this.newEntry.assetIdPart2 = parts[1];
                    this.newEntry.assetIdPart3 = parts[2];
                    return true;
                }
            } else if (!combinedId) { // 如果合併ID被清空，也清空分段
                 this.newEntry.assetIdPart1 = '';
                 this.newEntry.assetIdPart2 = '';
                 this.newEntry.assetIdPart3 = '';
            }
            return false;
        },

        // --- 核心 CRUD 功能 ---
        addEntry() {
            if (!this.newEntry.location || !this.newEntry.assetName || !this.newEntry.assetId || this.newEntry.assetId.includes('未辨識')) {
                 return alert('所有欄位皆為必填，且財產編號需辨識成功或完整輸入！');
            }
            db.collection('inventory_log').add({
                location: this.newEntry.location,
                assetName: this.newEntry.assetName,
                assetId: this.newEntry.assetId,
                userId: this.user.uid,
                remarks: '',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
             }).then(() => {
                alert(`財產 [${this.newEntry.assetId}] 已登錄`);
                localStorage.setItem('lastLocation', this.newEntry.location);
                localStorage.setItem('lastAssetName', this.newEntry.assetName);
                this.newEntry.assetId = ''; // 清空會觸發 watcher 清空分段
                this.imagePreviewUrl = '';
            }).catch(err => console.error("登錄失敗:", err));
        },
        fetchInventoryLog() {
            if(!this.user) return;
            db.collection('inventory_log').where('userId', '==', this.user.uid).orderBy('timestamp', 'desc')
              .onSnapshot(snapshot => {
                  this.inventoryLog = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              }, error => { // 新增錯誤處理
                  console.error("讀取盤點紀錄失敗:", error);
                  alert("讀取盤點紀錄失敗，請檢查 Firestore 規則或網路連線。");
              });
        },
        openEditModal(entry) {
            this.editEntry = { ...entry };
            // 分割 assetId 以顯示在編輯框中（如果編輯框需要分段顯示）
            const parts = entry.assetId ? entry.assetId.split('-') : ['', '', ''];
            this.editEntry.assetIdPart1 = parts[0] || '';
            this.editEntry.assetIdPart2 = parts[1] || '';
            this.editEntry.assetIdPart3 = parts[2] || '';
            this.showEditModal = true;
        },
        closeEditModal() {
            this.showEditModal = false;
        },
        updateEntry() {
            const { id, assetName, location, remarks } = this.editEntry;
            // 注意：我們通常不允許在編輯時更改 assetId
            db.collection('inventory_log').doc(id).update({ assetName, location, remarks })
              .then(() => this.closeEditModal())
              .catch(err => console.error("更新失敗:", err));
        },
        deleteEntry(docId) {
            if (confirm('確定要刪除這筆紀錄嗎？')) {
                db.collection('inventory_log').doc(docId).delete()
                  .catch(error => console.error("刪除失敗:", error));
            }
        },

        // --- CSV 處理 ---
        handleCsvFileSelection(event) {
            const file = event.target.files[0]; if (!file) return;
            this.uploadStatus = '讀取中...';
            Papa.parse(file, {
                header: true, skipEmptyLines: true,
                complete: (results) => {
                    this.csvData = results.data;
                    this.uploadStatus = `找到 ${this.csvData.length} 筆資料。`;
                },
                error: (error) => {
                    this.csvData = []; this.uploadStatus = `檔案解析失敗`;
                }
            });
        },
        importCsvData() {
            if (this.csvData.length === 0 || !this.user) return;
            this.uploadStatus = `匯入中...`; const batch = db.batch(); let count = 0;
            this.csvData.forEach(row => {
                const assetId = row['財產編號']?.trim();
                const assetName = row['財產名稱']?.trim();
                const location = row['存放地點']?.trim();
                if (assetId && assetName && location) {
                    const docRef = db.collection('master_assets').doc(assetId);
                    batch.set(docRef, { assetId, assetName, location, status: '未盤點', ownerId: this.user.uid });
                    count++;
                }
            });
            if (count === 0) return this.uploadStatus = 'CSV中無有效資料。';
            batch.commit().then(() => {
                this.uploadStatus = `成功匯入 ${count} 筆資料。`; alert('匯入成功！');
                this.csvData = []; if(this.$refs.csvInput) this.$refs.csvInput.value = '';
            }).catch(error => { this.uploadStatus = `匯入失敗: ${error.message}`; });
        },
        async deleteMasterAssets() {
            if (!this.user || !confirm("此操作將刪除所有已上傳的財產總表資料，確定嗎？")) return;
            this.uploadStatus = "刪除中..."; try {
                const querySnapshot = await db.collection('master_assets').where('ownerId', '==', this.user.uid).get();
                if (querySnapshot.empty) { this.uploadStatus = "沒有可刪除的總表資料。"; return; }
                const batch = db.batch();
                querySnapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                this.uploadStatus = `成功刪除 ${querySnapshot.size} 筆總表資料。`; alert("刪除成功！");
            } catch(error) { this.uploadStatus = `刪除失敗: ${error.message}`; }
        },

        // --- 比對與下載 ---
        async runComparison() {
            if (!this.user) return; this.isComparing = true; this.comparisonResults = [];
            try {
                const [masterSnapshot, logSnapshot] = await Promise.all([
                    db.collection('master_assets').where('ownerId', '==', this.user.uid).get(),
                    db.collection('inventory_log').where('userId', '==', this.user.uid).get()
                ]);
                if (masterSnapshot.empty) return;
                const inventoriedIds = new Set(logSnapshot.docs.map(doc => doc.data().assetId));
                this.comparisonResults = masterSnapshot.docs.map(doc => ({ ...doc.data(), status: inventoriedIds.has(doc.data().assetId) ? 'completed' : 'pending' }));
            } catch (error) { console.error("比對失敗:", error); alert("比對失敗"); }
            finally { this.isComparing = false; }
        },
        downloadCsv() {
            let dataToExport = []; let fileName = `盤點資料_${this.downloadFilter}_${new Date().toISOString().slice(0,10)}.csv`;
            if (this.downloadFilter === 'log') {
                if (this.inventoryLog.length === 0) return alert("尚無盤點紀錄可下載。");
                dataToExport = this.inventoryLog.map(item => ({ '盤點地點': item.location, '財產名稱': item.assetName, '財產編號': item.assetId, '備註': item.remarks, '盤點時間': this.formatDate(item.timestamp) }));
            } else {
                if (this.comparisonResults.length === 0) return alert("尚無比對資料可下載。");
                const filteredData = this.comparisonResults.filter(item => this.downloadFilter === 'all' || item.status === this.downloadFilter);
                if (filteredData.length === 0) return alert("沒有符合篩選條件的資料。");
                dataToExport = filteredData.map(item => ({ '存放地點': item.location, '財產名稱': item.assetName, '財產編號': item.assetId, '盤點狀態': item.status === 'completed' ? '已盤點' : '未盤點' }));
            }
            const csv = Papa.unparse(dataToExport); const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = fileName; link.click(); link.remove(); // 修正: 點擊後移除連結
        }
    },
    // Vue 的生命週期 & 監聽器
    mounted() {
        auth.onAuthStateChanged(user => {
            this.user = user;
            if (user) {
                this.fetchInventoryLog();
                this.newEntry.location = localStorage.getItem('lastLocation') || '';
                this.newEntry.assetName = localStorage.getItem('lastAssetName') || '';
            } else {
                // 登出時重置所有資料為初始狀態
                Object.assign(this.$data, this.$options.data.call(this));
            }
        });
    },
    watch: {
        'newEntry.assetIdPart1'() { this.combineAssetId(); },
        'newEntry.assetIdPart2'() { this.combineAssetId(); },
        'newEntry.assetIdPart3'() { this.combineAssetId(); },
        'newEntry.assetId'(newValue, oldValue) {
             // 只有在 assetId 被外部改變時 (例如 OCR)，才觸發 split
             const combinedFromParts = `${String(this.newEntry.assetIdPart1 || '').trim()}-${String(this.newEntry.assetIdPart2 || '').trim()}-${String(this.newEntry.assetIdPart3 || '').trim()}`;
             // 檢查newValue是否為真值，以及是否與當前分段組合不同
             if (newValue && newValue !== combinedFromParts && !this.isLoadingOCR) {
                 this.splitAssetId(newValue);
             } else if (!newValue) { // 如果newValue為空，確保清空分段
                 this.splitAssetId(newValue);
             }
        },
        currentView(newView) { if (newView === 'compare') this.runComparison(); }
    },
    // HTML 模板 (已更新分段輸入和相關樣式)
    template: `
        <header><h1>學校財產盤點系統</h1><div id="auth-container"><template v-if="user"><span id="user-display">{{ user.displayName || user.email }}</span><button @click="logout">登出</button></template><button v-else @click="login">使用 Google 登入</button></div></header>
        <template v-if="user"><nav><button @click="currentView = 'inventory'" :class="{ active: currentView === 'inventory' }">盤點輸入</button><button @click="currentView = 'results'" :class="{ active: currentView === 'results' }">盤點結果</button><button @click="currentView = 'upload'" :class="{ active: currentView === 'upload' }">上傳資料</button><button @click="currentView = 'compare'" :class="{ active: currentView === 'compare' }">比對下載</button></nav><main><section v-if="currentView === 'inventory'" class="view"><h2>1. 盤點輸入</h2><div class="form-group"><label>存放地點</label><input type="text" v-model="newEntry.location" placeholder="例如：電腦教室 (一)"></div><div class="form-group"><label>財產名稱</label><input type="text" v-model="newEntry.assetName" placeholder="例如：電腦主機"></div><div class="form-group scan-group"><label>掃描盤點 (OCR)</label><p class="description">點擊按鈕後，對準財產標籤上的編號。</p><input type="file" @change="handleFileUpload" ref="fileInput" accept="image/*" capture="environment" style="display: none;"><button @click="$refs.fileInput.click()" :disabled="isLoadingOCR"><span v-if="isLoadingOCR">辨識中...</span><span v-else>📷 掃描財產編號</span></button><img v-if="imagePreviewUrl" :src="imagePreviewUrl" alt="圖片預覽" style="max-width: 100%; margin-top: 10px;"></div><fieldset class="form-group segmented-input"><legend>分段輸入 (財產編號)</legend><div class="input-row" style="display: flex; gap: 5px; align-items: center;"><input type="text" v-model="newEntry.assetIdPart1" placeholder="XXXXXXXX" maxlength="8" style="flex: 3; text-align: center;"><span>-</span><input type="text" v-model="newEntry.assetIdPart2" placeholder="XX" maxlength="2" style="flex: 1; text-align: center;"><span>-</span><input type="text" v-model="newEntry.assetIdPart3" placeholder="XXXXXXXXX" maxlength="9" style="flex: 3; text-align: center;"></div></fieldset><div class="form-group"><label>完整財產編號 (自動合併/掃描結果)</label><input type="text" :value="newEntry.assetId" placeholder="掃描或分段輸入結果將顯示於此" readonly style="background-color: #e9ecef; color: #495057;"></div><button @click="addEntry" class="primary-btn">登錄財產</button></section><section v-if="currentView === 'results'" class="view"><h2>2. 盤點結果</h2><div v-if="inventoryLog.length === 0"><p>尚無盤點紀錄。</p></div><div v-else class="results-list"><div v-for="entry in inventoryLog" :key="entry.id" class="result-item"><div class="info"><p><strong>編號:</strong> {{ entry.assetId }}</p><p><strong>名稱:</strong> {{ entry.assetName }}</p><p><strong>地點:</strong> {{ entry.location }}</p><p><strong>備註:</strong> {{ entry.remarks || '無' }}</p><p><small>{{ formatDate(entry.timestamp) }}</small></p></div><div class="actions"><button @click="openEditModal(entry)">編輯</button><button @click="deleteEntry(entry.id)">刪除</button></div></div></div></section><section v-if="currentView === 'upload'" class="view"><h2>3. 上傳財產總表 (CSV)</h2><div class="form-group"><label for="csv-file">選擇新的 CSV 檔案</label><input type="file" @change="handleCsvFileSelection" ref="csvInput" accept=".csv" id="csv-file"><p class="description">請上傳含「財產編號」、「財產名稱」、「存放地點」欄位的檔案。</p></div><button @click="importCsvData" class="primary-btn" :disabled="csvData.length === 0">匯入 {{ csvData.length > 0 ? csvData.length + ' 筆' : '' }} 資料</button><div class="upload-status">{{ uploadStatus }}</div><hr class="divider"><div class="danger-zone"><p class="description">此操作將刪除所有已上傳的財產總表資料。此操作無法復原。</p><button @click="deleteMasterAssets" class="danger-btn">刪除全部總表資料</button></div></section><section v-if="currentView === 'compare'" class="view"><h2>4. 資料比對與下載</h2><div class="download-controls"><div class="form-group"><label for="download-filter">選擇要下載的資料</label><select v-model="downloadFilter" id="download-filter"><option value="log">盤點結果 (掃描紀錄)</option><option value="completed">僅盤點完成 (比對後)</option><option value="pending">僅未盤點 (比對後)</option><option value="all">全部財產 (比對後)</option></select></div><button @click="downloadCsv" class="primary-btn">下載篩選結果 (CSV)</button></div><div class="comparison-table-container"><div v-if="isComparing" class="loading-overlay">正在比對資料...</div><table v-else><thead><tr><th>狀態</th><th>財產編號</th><th>財產名稱</th><th>存放地點</th></tr></thead><tbody><tr v-if="comparisonResults.length === 0"><td colspan="4">尚無資料可比對，請先上傳財產總表。</td></tr><tr v-for="item in comparisonResults" :key="item.assetId"><td><span :class="'status-' + item.status">{{ item.status === 'completed' ? '盤點完成' : '未盤點' }}</span></td><td>{{ item.assetId }}</td><td>{{ item.assetName }}</td><td>{{ item.location }}</td></tr></tbody></table></div></section></main></template>
        <div v-if="showEditModal" class="modal-overlay"><div class="modal-content"><h2>編輯盤點紀錄</h2><div class="form-group"><label>財產編號</label><input type="text" :value="editEntry.assetId" readonly></div><div class="form-group"><label>財產名稱</label><input type="text" v-model="editEntry.assetName"></div><div class="form-group"><label>存放地點</label><input type="text" v-model="editEntry.location"></div><div class="form-group"><label>備註</label><textarea v-model="editEntry.remarks" rows="3"></textarea></div><div class="modal-actions"><button @click="updateEntry" class="primary-btn">儲存變更</button><button @click="closeEditModal">取消</button></div></div></div>
    `
};
Vue.createApp(App).mount('#app');