// ===== 1. KẾT NỐI FIREBASE =====
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, deleteField,
  onSnapshot, query, orderBy, FieldPath
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteField,
  onSnapshot, query, orderBy, FieldPath
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB70v6tPZnrjxUor1hdsrzdgOtSVHuCIN0",
  authDomain: "lich-ranh-di-an.firebaseapp.com",
  projectId: "lich-ranh-di-an",
  storageBucket: "lich-ranh-di-an.firebasestorage.app",
  messagingSenderId: "975335100265",
  appId: "1:975335100265:web:84525980617206bafbf7f8",
  measurementId: "G-2NZ85Z2T84"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const membersCol = collection(db, "members");

// ===== 2. DỮ LIỆU =====
// ===== Cấu hình lịch =====
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();                 // 0 = CN
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
const START = new Date(2025, 11, 29);   // ngày bắt đầu (tháng JS đếm từ 0: 10 = tháng 11)
const END   = new Date(2027, 0, 3);   // ngày kết thúc
const DAYS_PER_WEEK = 7;
const DAY_NAMES = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const MS_PER_DAY = 86400000;

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Tạo key "2026-11-25" (không dùng toISOString vì bị lệch múi giờ)
function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const totalDays = Math.round((END - START) / MS_PER_DAY) + 1;
const totalWeeks = Math.ceil(totalDays / DAYS_PER_WEEK);

// Trả về mảng ngày của tuần số `index`, cùng dạng { key, label } như trước
function getWeekDays(index) {
  const weekStart = addDays(START, index * DAYS_PER_WEEK);
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => {
    const d = addDays(weekStart, i);
    return {
      key: toKey(d),
      label: `${DAY_NAMES[d.getDay()]} (${d.getDate()}/${d.getMonth() + 1})`,
      date: d
    };
  });
}

// Hôm nay thuộc tuần số mấy (để mở web ra là thấy đúng tuần hiện tại)
function indexForDate(date) {
  const diff = Math.floor((date - START) / MS_PER_DAY);
  return Math.min(Math.max(Math.floor(diff / DAYS_PER_WEEK), 0), totalWeeks - 1);
}

let weekIndex = indexForDate(new Date());
let members = [];   // sẽ được Firestore điền vào, mỗi phần tử: { id, name, slots, order }

// ===== 3. ĐỌC REALTIME =====
// Mỗi khi dữ liệu trên Firestore đổi (do bạn hoặc người khác), hàm này tự chạy lại
const q = query(membersCol, orderBy("order"));
onSnapshot(q, (snapshot) => {
  members = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderTable();
}, (err) => {
  console.error(err);
  alert("Không đọc được dữ liệu. Mở F12 → Console để xem lỗi.");
});

// ===== 4. VẼ BẢNG =====
const headerRow = document.getElementById("headerRow");
const bodyRows = document.getElementById("bodyRows");

function renderTable() {
  const days = getWeekDays(weekIndex);   // <-- THÊM: lấy ngày của tuần đang xem
  updateWeekNav(days);                   // <-- THÊM: cập nhật nhãn và nút
  headerRow.innerHTML = "";
  bodyRows.innerHTML = "";

  ["STT", "Họ và tên", ...days.map(d => d.label)].forEach(text => {
    const th = document.createElement("th");
    th.textContent = text;
    headerRow.appendChild(th);
  });

  members.forEach((member, index) => {
    const tr = document.createElement("tr");

    const tdNo = document.createElement("td");
    tdNo.textContent = index + 1;
    tr.appendChild(tdNo);

    const tdName = document.createElement("td");
tdName.textContent = member.name;

const delBtn = document.createElement("button");
delBtn.className = "btn-delete";
delBtn.textContent = "🗑";
delBtn.title = "Xoá thành viên";
delBtn.addEventListener("click", () => deleteMember(member));
tdName.appendChild(delBtn);

tr.appendChild(tdName);

    days.forEach(day => {
      const td = document.createElement("td");
      const slots = (member.slots && member.slots[day.key]) || [];

      slots.forEach(slot => {
        const span = document.createElement("span");
        span.className = "tag " + CLASS_BY_SLOT[slot];
        const CLASS_BY_SLOT = { "TRƯA": "trua", "TỐI": "toi", "BẬN": "ban" };
        span.textContent = slot;
        td.appendChild(span);
      });

      td.addEventListener("click", () => openPicker(member.id, day.key, td));
      tr.appendChild(td);
    });

    bodyRows.appendChild(tr);
  });
}

// ===== 5. MENU CHỌN + GHI LÊN FIRESTORE =====
const picker = document.getElementById("picker");
const checkboxes = picker.querySelectorAll("input[type=checkbox]");
let editing = null;   // { memberId, dateKey }

function openPicker(memberId, dateKey, cell) {
  editing = { memberId, dateKey };

  const member = members.find(m => m.id === memberId);
  const current = (member.slots && member.slots[dateKey]) || [];
  checkboxes.forEach(cb => { cb.checked = current.includes(cb.value); });

  const rect = cell.getBoundingClientRect();
  picker.style.top = (rect.bottom + window.scrollY) + "px";
  picker.style.left = (rect.left + window.scrollX) + "px";
  picker.classList.remove("hidden");
}

async function closePicker() {
  const chosen = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
  const { memberId, dateKey } = editing;

  picker.classList.add("hidden");
  editing = null;

  try {
    // Chỉ sửa đúng 1 ngày của 1 người, không đụng các ngày khác
    await updateDoc(
      doc(db, "members", memberId),
      new FieldPath("slots", dateKey),
      chosen.length > 0 ? chosen : deleteField()
    );
    // Không cần gọi renderTable(): onSnapshot tự chạy lại khi dữ liệu đổi
  } catch (err) {
    console.error(err);
    alert("Không lưu được, thử lại nhé.");
  }
}
document.getElementById("closeBtn").addEventListener("click", closePicker);

// ===== 6. THÊM THÀNH VIÊN =====
document.getElementById("addMemberBtn").addEventListener("click", async () => {
  const name = prompt("Tên thành viên:");
  if (!name || !name.trim()) return;
  await addDoc(membersCol, {
    name: name.trim(),
    slots: {},
    order: Date.now()   // dùng để sắp xếp theo thứ tự thêm vào
  });
});
// ===== XOÁ THÀNH VIÊN =====
async function deleteMember(member) {
  if (!confirm(`Xoá "${member.name}" khỏi lịch? Không khôi phục được đâu.`)) return;

  picker.classList.add("hidden");   // tránh menu chọn đang mở cho người vừa xoá
  editing = null;

  try {
    await deleteDoc(doc(db, "members", member.id));
    // onSnapshot tự vẽ lại bảng
  } catch (err) {
    console.error(err);
    alert("Không xoá được. Kiểm tra Firestore Rules (cần cho phép delete).");
  }
}
// ===== 7. CHUYỂN TUẦN =====
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const todayBtn = document.getElementById("todayBtn");
const weekLabel = document.getElementById("weekLabel");

function updateWeekNav(days) {
  const f = d => `${d.getDate()}/${d.getMonth() + 1}`;
  weekLabel.textContent =
    `${f(days[0].date)} – ${f(days[days.length - 1].date)} (tuần ${weekIndex + 1}/${totalWeeks})`;
  prevBtn.disabled = weekIndex === 0;
  nextBtn.disabled = weekIndex === totalWeeks - 1;
}

function goToWeek(index) {
  weekIndex = Math.min(Math.max(index, 0), totalWeeks - 1);
  picker.classList.add("hidden");   // đóng menu chọn nếu đang mở
  editing = null;
  renderTable();
}

prevBtn.addEventListener("click", () => goToWeek(weekIndex - 1));
nextBtn.addEventListener("click", () => goToWeek(weekIndex + 1));
todayBtn.addEventListener("click", () => goToWeek(indexForDate(new Date())));



