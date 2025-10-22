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


// 初始化 Firebase (不需要 Storage)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const App = {
    data() {
        return {
            user: null, currentView: 'inventory', inventoryLog: [],
            newEntry: { location: '', assetName: '', assetId: '', assetIdPart1: '', assetIdPart2: '', assetIdPart3: '', remarks: '' }, // 新增 remarks
            showEditModal: false, editEntry: {},
            // isLoadingOCR: false, // 移除 OCR 相關
            // imagePreviewUrl: '', // 移除 OCR 相關
            csvData: [], uploadStatus: '', isComparing: false, comparisonResults: [], downloadFilter: 'log'
        }
    },
    methods: {
        login() { /* ... (無變更) ... */ },
        logout() { /* ... (無變更) ... */ },
        formatDate(timestamp) { /* ... (無變更) ... */ },

        // --- 【已移除】 OCR 處理 ---
        // handleFileUpload(event) { ... } // 整個方法已移除

        // --- 分段輸入與合併/拆分 (無變更) ---
        combineAssetId() { const p1 = String(this.newEntry.assetIdPart1 || '').trim(); const p2 = String(this.newEntry.assetIdPart2 || '').trim(); const p3 = String(this.newEntry.assetIdPart3 || '').trim(); if (p1 && p2 && p3) { const combined = `${p1}-${p2}-${p3}`; if (combined !== this.newEntry.assetId) { this.newEntry.assetId = combined; } } },
        splitAssetId(combinedId) { if (combinedId && typeof combinedId === 'string') { const parts = combinedId.split('-'); if (parts.length === 3) { this.newEntry.assetIdPart1 = parts[0]; this.newEntry.assetIdPart2 = parts[1]; this.newEntry.assetIdPart3 = parts[2]; return true; } } else if (!combinedId) { this.newEntry.assetIdPart1 = ''; this.newEntry.assetIdPart2 = ''; this.newEntry.assetIdPart3 = ''; } return false; },

        // --- 【新增】減號自動跳格 ---
        focusNext(refName) { this.$refs[refName]?.focus(); },
        // --- 【新增】清空財產編號 ---
        clearAssetId() { this.newEntry.assetId = ''; this.newEntry.assetIdPart1 = ''; this.newEntry.assetIdPart2 = ''; this.newEntry.assetIdPart3 = ''; },

        // --- 核心 CRUD 功能 (已優化) ---
        async addEntry() { // 改為 async
            if (!this.newEntry.location || !this.newEntry.assetName || !this.newEntry.assetId) { return alert('存放地點、財產名稱和財產編號為必填！'); }
            if (!this.user) return alert('請先登入！');

            // --- 【新增】重複檢查 ---
            try {
                const q = db.collection('inventory_log')
                            .where('userId', '==', this.user.uid)
                            .where('assetId', '==', this.newEntry.assetId);
                const querySnapshot = await q.get();
                if (!querySnapshot.empty) {
                    return alert(`錯誤：財產編號 [${this.newEntry.assetId}] 在您的盤點紀錄中已經存在！`);
                }
            } catch (error) {
                console.error("檢查重複紀錄時出錯:", error);
                alert("檢查重複紀錄時發生錯誤，請稍後再試。");
                return;
            }

            // --- 繼續新增 ---
            db.collection('inventory_log').add({
                location: this.newEntry.location,
                assetName: this.newEntry.assetName,
                assetId: this.newEntry.assetId,
                userId: this.user.uid,
                remarks: this.newEntry.remarks.trim(), // 新增儲存備註
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
             }).then(() => {
                alert(`財產 [${this.newEntry.assetId}] 已登錄`);
                localStorage.setItem('lastLocation', this.newEntry.location);
                localStorage.setItem('lastAssetName', this.newEntry.assetName);
                // --- 【優化】只清空第三段編號和備註 ---
                // this.newEntry.assetId = ''; // 不清空合併欄，由 watch 清空分段觸發
                // this.newEntry.assetIdPart1 = ''; // 不清空
                // this.newEntry.assetIdPart2 = ''; // 不清空
                this.newEntry.assetIdPart3 = '';
                this.newEntry.remarks = ''; // 清空備註
                // this.imagePreviewUrl = ''; // 已移除
            }).catch(err => console.error("登錄失敗:", err));
        },
        fetchInventoryLog() { /* ... (無變更) ... */ },
        openEditModal(entry) { /* ... (無變更) ... */ },
        closeEditModal() { /* ... (無變更) ... */ },
        updateEntry() { /* ... (無變更) ... */ },
        deleteEntry(docId) { /* ... (無變更) ... */ },
        handleCsvFileSelection(event) { /* ... (無變更) ... */ },
        importCsvData() { /* ... (無變更) ... */ },
        async deleteMasterAssets() { /* ... (無變更) ... */ },
        async runComparison() { /* ... (無變更) ... */ },
        downloadCsv() { /* ... (無變更) ... */ }
    },
    mounted() {
        auth.onAuthStateChanged(user => {
            this.user = user;
            if (user) {
                this.fetchInventoryLog();
                this.newEntry.location = localStorage.getItem('lastLocation') || '';
                this.newEntry.assetName = localStorage.getItem('lastAssetName') || '';
            } else {
                Object.assign(this.$data, this.$options.data());
            }
        });
    },
    watch: {
        // --- 【優化】監聽邏輯 ---
        'newEntry.assetIdPart1'() { this.combineAssetId(); },
        'newEntry.assetIdPart2'() { this.combineAssetId(); },
        'newEntry.assetIdPart3'() { this.combineAssetId(); },
        'newEntry.assetId'(newValue) {
             const combinedFromParts = `${String(this.newEntry.assetIdPart1 || '').trim()}-${String(this.newEntry.assetIdPart2 || '').trim()}-${String(this.newEntry.assetIdPart3 || '').trim()}`;
             if (newValue !== combinedFromParts) {
                 this.splitAssetId(newValue);
             }
        },
        currentView(newView) { if (newView === 'compare') this.runComparison(); }
    },
    // HTML 模板 (已移除 OCR, 新增備註和清空按鈕)
    template: `
        <header><h1>學校財產盤點系統</h1><div id="auth-container"><template v-if="user"><span id="user-display">{{ user.displayName || user.email }}</span><button @click="logout">登出</button></template><button v-else @click="login">使用 Google 登入</button></div></header>
        <template v-if="user"><nav><button @click="currentView = 'inventory'" :class="{ active: currentView === 'inventory' }">盤點輸入</button><button @click="currentView = 'results'" :class="{ active: currentView === 'results' }">盤點結果</button><button @click="currentView = 'upload'" :class="{ active: currentView === 'upload' }">上傳資料</button><button @click="currentView = 'compare'" :class="{ active: currentView === 'compare' }">比對下載</button></nav>
        <main>
            <section v-if="currentView === 'inventory'" class="view">
                <h2>1. 盤點輸入</h2>
                <div class="form-group"><label>存放地點</label><input type="text" v-model="newEntry.location" placeholder="例如：電腦教室 (一)"></div>
                <div class="form-group"><label>財產名稱</label><input type="text" v-model="newEntry.assetName" placeholder="例如：電腦主機"></div>

                <fieldset class="form-group segmented-input">
                  <legend>分段輸入 (財產編號)</legend>
                  <div class="input-row">
                    <input type="text" v-model="newEntry.assetIdPart1" placeholder="XXXXXXXX" maxlength="8" ref="part1Input" @keydown="event => { if (event.key === '-') { event.preventDefault(); focusNext('part2Input'); } }">
                    <span>-</span>
                    <input type="text" v-model="newEntry.assetIdPart2" placeholder="XX" maxlength="2" ref="part2Input" @keydown="event => { if (event.key === '-') { event.preventDefault(); focusNext('part3Input'); } }">
                    <span>-</span>
                    <input type="text" v-model="newEntry.assetIdPart3" placeholder="XXXXXXXXX" maxlength="9" ref="part3Input">
                  </div>
                </fieldset>
                
                <div class="clear-btn-container">
                    <button @click="clearAssetId" class="secondary-btn small-btn">清空編號</button>
                </div>

                <div class="form-group">
                    <label>完整財產編號 (自動合併)</label>
                    <input type="text" :value="newEntry.assetId" placeholder="分段輸入結果將顯示於此" readonly style="background-color: #e9ecef; color: #495057;">
                </div>
                
                <button @click="addEntry" class="primary-btn">登錄財產</button>

                <div class="form-group remarks-section">
                    <label for="remarks">備註 (選填)</label>
                    <textarea id="remarks" v-model="newEntry.remarks" rows="2" placeholder="例如：螢幕有刮痕、待維修"></textarea>
                </div>
            </section>
            
            <section v-if="currentView === 'results'" class="view"><h2>2. 盤點結果</h2><div v-if="inventoryLog.length === 0"><p>尚無盤點紀錄。</p></div><div v-else class="results-list"><div v-for="entry in inventoryLog" :key="entry.id" class="result-item"><div class="info"><p><strong>編號:</strong> {{ entry.assetId }}</p><p><strong>名稱:</strong> {{ entry.assetName }}</p><p><strong>地點:</strong> {{ entry.location }}</p><p><strong>備註:</strong> {{ entry.remarks || '無' }}</p><p><small>{{ formatDate(entry.timestamp) }}</small></p></div><div class="actions"><button @click="openEditModal(entry)">編輯</button><button @click="deleteEntry(entry.id)">刪除</button></div></div></div></section>
            <section v-if="currentView === 'upload'" class="view"><h2>3. 上傳財產總表 (CSV)</h2><div class="form-group"><label for="csv-file">選擇新的 CSV 檔案</label><input type="file" @change="handleCsvFileSelection" ref="csvInput" accept=".csv" id="csv-file"><p class="description">請上傳含「財產編號」、「財產名稱」、「存放地點」欄位的檔案。</p></div><button @click="importCsvData" class="primary-btn" :disabled="csvData.length === 0">匯入 {{ csvData.length > 0 ? csvData.length + ' 筆' : '' }} 資料</button><div class="upload-status">{{ uploadStatus }}</div><hr class="divider"><div class="danger-zone"><p class="description">此操作將刪除所有已上傳的財產總表資料。此操作無法復原。</p><button @click="deleteMasterAssets" class="danger-btn">刪除全部總表資料</button></div></section>
            <section v-if="currentView === 'compare'" class="view"><h2>4. 資料比對與下載</h2><div class="download-controls"><div class="form-group"><label for="download-filter">選擇要下載的資料</label><select v-model="downloadFilter" id="download-filter"><option value="log">盤點結果 (掃描紀錄)</option><option value="completed">僅盤點完成 (比對後)</option><option value="pending">僅未盤點 (比對後)</option><option value="all">全部財產 (比對後)</option></select></div><button @click="downloadCsv" class="primary-btn">下載篩選結果 (CSV)</button></div><div class="comparison-table-container"><div v-if="isComparing" class="loading-overlay">正在比對資料...</div><table v-else><thead><tr><th>狀態</th><th>財產編號</th><th>財產名稱</th><th>存放地點</th></tr></thead><tbody><tr v-if="comparisonResults.length === 0"><td colspan="4">尚無資料可比對，請先上傳財產總表。</td></tr><tr v-for="item in comparisonResults" :key="item.assetId"><td><span :class="'status-' + item.status">{{ item.status === 'completed' ? '盤點完成' : '未盤點' }}</span></td><td>{{ item.assetId }}</td><td>{{ item.assetName }}</td><td>{{ item.location }}</td></tr></tbody></table></div></section>
        </main></template>
        <div v-if="showEditModal" class="modal-overlay"><div class="modal-content"><h2>編輯盤點紀錄</h2><div class="form-group"><label>財產編號</label><input type="text" :value="editEntry.assetId" readonly></div><div class="form-group"><label>財產名稱</label><input type="text" v-model="editEntry.assetName"></div><div class="form-group"><label>存放地點</label><input type="text" v-model="editEntry.location"></div><div class="form-group"><label>備註</label><textarea v-model="editEntry.remarks" rows="3"></textarea></div><div class="modal-actions"><button @click="updateEntry" class="primary-btn">儲存變更</button><button @click="closeEditModal">取消</button></div></div></div>
    `
};

// 注入所有 methods (確保完整性)
App.methods.login = function() { const provider = new firebase.auth.GoogleAuthProvider(); auth.signInWithPopup(provider).catch(error => console.error("登入失敗:", error)); };
App.methods.logout = function() { auth.signOut(); };
App.methods.formatDate = function(timestamp) { return timestamp ? new Date(timestamp.toDate()).toLocaleString() : 'N/A'; };
// App.methods.handleFileUpload = ... // 已移除
App.methods.combineAssetId = function() { const p1 = String(this.newEntry.assetIdPart1 || '').trim(); const p2 = String(this.newEntry.assetIdPart2 || '').trim(); const p3 = String(this.newEntry.assetIdPart3 || '').trim(); if (p1 && p2 && p3) { const combined = `${p1}-${p2}-${p3}`; if (combined !== this.newEntry.assetId) { this.newEntry.assetId = combined; } } };
App.methods.splitAssetId = function(combinedId) { if (combinedId && typeof combinedId === 'string') { const parts = combinedId.split('-'); if (parts.length === 3) { this.newEntry.assetIdPart1 = parts[0]; this.newEntry.assetIdPart2 = parts[1]; this.newEntry.assetIdPart3 = parts[2]; return true; } } else if (!combinedId) { this.newEntry.assetIdPart1 = ''; this.newEntry.assetIdPart2 = ''; this.newEntry.assetIdPart3 = ''; } return false; };
App.methods.focusNext = function(refName) { this.$refs[refName]?.focus(); };
App.methods.clearAssetId = function() { this.newEntry.assetId = ''; /* watcher 會清空分段 */ };
App.methods.addEntry = async function() { if (!this.newEntry.location || !this.newEntry.assetName || !this.newEntry.assetId) { return alert('存放地點、財產名稱和財產編號為必填！'); } if (!this.user) return alert('請先登入！'); try { const q = db.collection('inventory_log').where('userId', '==', this.user.uid).where('assetId', '==', this.newEntry.assetId); const querySnapshot = await q.get(); if (!querySnapshot.empty) { return alert(`錯誤：財產編號 [${this.newEntry.assetId}] 已存在！`); } } catch (error) { console.error("檢查重複出錯:", error); alert("檢查重複時出錯"); return; } db.collection('inventory_log').add({ location: this.newEntry.location, assetName: this.newEntry.assetName, assetId: this.newEntry.assetId, userId: this.user.uid, remarks: this.newEntry.remarks.trim(), timestamp: firebase.firestore.FieldValue.serverTimestamp() }).then(() => { alert(`財產 [${this.newEntry.assetId}] 已登錄`); localStorage.setItem('lastLocation', this.newEntry.location); localStorage.setItem('lastAssetName', this.newEntry.assetName); this.newEntry.assetIdPart3 = ''; this.newEntry.remarks = ''; }).catch(err => console.error("登錄失敗:", err)); };
App.methods.fetchInventoryLog = function() { if(!this.user) return; db.collection('inventory_log').where('userId', '==', this.user.uid).orderBy('timestamp', 'desc').onSnapshot(snapshot => { this.inventoryLog = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); }, error => { console.error("讀取紀錄失敗:", error); }); };
App.methods.openEditModal = function(entry) { this.editEntry = { ...entry }; const parts = entry.assetId ? entry.assetId.split('-') : ['', '', '']; this.editEntry.assetIdPart1 = parts[0] || ''; this.editEntry.assetIdPart2 = parts[1] || ''; this.editEntry.assetIdPart3 = parts[2] || ''; this.showEditModal = true; };
App.methods.closeEditModal = function() { this.showEditModal = false; };
App.methods.updateEntry = function() { const { id, assetName, location, remarks } = this.editEntry; db.collection('inventory_log').doc(id).update({ assetName, location, remarks }).then(() => this.closeEditModal()).catch(err => console.error("更新失敗:", err)); };
App.methods.deleteEntry = function(docId) { if (confirm('確定要刪除這筆紀錄嗎？')) { db.collection('inventory_log').doc(docId).delete().catch(error => console.error("刪除失敗:", error)); } };
App.methods.handleCsvFileSelection = function(event) { const file = event.target.files[0]; if (!file) return; this.uploadStatus = '讀取中...'; Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => { this.csvData = results.data; this.uploadStatus = `找到 ${this.csvData.length} 筆資料。`; }, error: (error) => { this.csvData = []; this.uploadStatus = `檔案解析失敗`; } }); };
App.methods.importCsvData = function() { if (this.csvData.length === 0 || !this.user) return; this.uploadStatus = `匯入中...`; const batch = db.batch(); let count = 0; this.csvData.forEach(row => { const assetId = row['財產編號']?.trim(); const assetName = row['財產名稱']?.trim(); const location = row['存放地點']?.trim(); if (assetId && assetName && location) { const docRef = db.collection('master_assets').doc(assetId); batch.set(docRef, { assetId, assetName, location, status: '未盤點', ownerId: this.user.uid }); count++; } }); if (count === 0) return this.uploadStatus = 'CSV中無有效資料。'; batch.commit().then(() => { this.uploadStatus = `成功匯入 ${count} 筆資料。`; alert('匯入成功！'); this.csvData = []; if(this.$refs.csvInput) this.$refs.csvInput.value = ''; }).catch(error => { this.uploadStatus = `匯入失敗: ${error.message}`; }); };
App.methods.deleteMasterAssets = async function() { if (!this.user || !confirm("此操作將刪除所有已上傳的財產總表資料，確定嗎？")) return; this.uploadStatus = "刪除中..."; try { const querySnapshot = await db.collection('master_assets').where('ownerId', '==', this.user.uid).get(); if (querySnapshot.empty) { this.uploadStatus = "沒有可刪除的總表資料。"; return; } const batch = db.batch(); querySnapshot.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); this.uploadStatus = `成功刪除 ${querySnapshot.size} 筆總表資料。`; alert("刪除成功！"); } catch(error) { this.uploadStatus = `刪除失敗: ${error.message}`; } };
App.methods.runComparison = async function() { if (!this.user) return; this.isComparing = true; this.comparisonResults = []; try { const [masterSnapshot, logSnapshot] = await Promise.all([db.collection('master_assets').where('ownerId', '==', this.user.uid).get(), db.collection('inventory_log').where('userId', '==', this.user.uid).get()]); if (masterSnapshot.empty) return; const inventoriedIds = new Set(logSnapshot.docs.map(doc => doc.data().assetId)); this.comparisonResults = masterSnapshot.docs.map(doc => ({ ...doc.data(), status: inventoriedIds.has(doc.data().assetId) ? 'completed' : 'pending' })); } catch (error) { console.error("比對失敗:", error); alert("比對失敗"); } finally { this.isComparing = false; } };
App.methods.downloadCsv = function() { let dataToExport = []; let fileName = `盤點資料_${this.downloadFilter}_${new Date().toISOString().slice(0,10)}.csv`; if (this.downloadFilter === 'log') { if (this.inventoryLog.length === 0) return alert("尚無盤點紀錄可下載。"); dataToExport = this.inventoryLog.map(item => ({ '盤點地點': item.location, '財產名稱': item.assetName, '財產編號': item.assetId, '備註': item.remarks, '盤點時間': this.formatDate(item.timestamp) })); } else { if (this.comparisonResults.length === 0) return alert("尚無比對資料可下載。"); const filteredData = this.comparisonResults.filter(item => this.downloadFilter === 'all' || item.status === this.downloadFilter); if (filteredData.length === 0) return alert("沒有符合篩選條件的資料。"); dataToExport = filteredData.map(item => ({ '存放地點': item.location, '財產名稱': item.assetName, '財產編號': item.assetId, '盤點狀態': item.status === 'completed' ? '已盤點' : '未盤點' })); } const csv = Papa.unparse(dataToExport); const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = fileName; link.click(); link.remove(); };

Vue.createApp(App).mount('#app');