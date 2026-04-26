/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  updateDoc,
  doc, 
  serverTimestamp, 
  Timestamp,
  query,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { 
  Settings, 
  Calendar as CalendarIcon, 
  Clock, 
  Plus, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  User,
  School,
  X,
  GripVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableFacilityProps {
  f: Facility;
  isAdmin: boolean;
  setPendingDeleteFacility: (data: {id: string, name: string} | null) => void;
  onSelect: (f: Facility, view: 'timetable' | 'calendar') => void;
  onEdit: (f: Facility) => void;
  key?: React.Key;
}

// --- Sortable Item Component ---
function SortableFacility({ f, isAdmin, setPendingDeleteFacility, onSelect, onEdit }: SortableFacilityProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: f.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl hover:border-blue-200 transition-all group h-full flex flex-col relative"
    >
      {isAdmin && (
        <div 
          {...attributes} {...listeners}
          className="absolute top-4 left-4 p-1 text-slate-300 hover:text-blue-500 cursor-grab active:cursor-grabbing z-10 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical size={20} />
        </div>
      )}
      
      <div className="p-6 flex flex-col h-full mt-2">
        <div className="flex justify-between items-start mb-4">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
            <School size={24} />
          </div>
          {isAdmin && (
            <div className="flex gap-2" onPointerDown={e => e.stopPropagation()}>
              <button 
                onClick={(e) => { e.stopPropagation(); onEdit(f); }}
                className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-90"
                title="시설 수정"
              >
                <Settings size={18} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setPendingDeleteFacility({id: f.id, name: f.name}); }}
                className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-100 text-slate-400 hover:text-rose-600 hover:border-rose-200 transition-all active:scale-90"
                title="시설 삭제"
              >
                <Trash2 size={18} />
              </button>
            </div>
          )}
        </div>
        
        <h3 className="text-xl font-black text-slate-800 mb-1 leading-tight">{f.name}</h3>
        <p className="text-slate-400 text-xs font-medium mb-6">학교 공용 시설 예약 시스템</p>
        
        <div className="flex gap-1.5 md:gap-2 mt-auto" onPointerDown={e => e.stopPropagation()}>
          <button
            onClick={() => onSelect(f, 'timetable')}
            className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-2 md:py-3 px-1 md:px-4 rounded-xl md:rounded-2xl font-bold shadow-lg shadow-blue-100 transition-all active:scale-95 flex items-center justify-center gap-1 md:gap-2 text-[10px] md:text-sm whitespace-nowrap"
          >
            <Clock size={12} className="md:w-4 md:h-4" strokeWidth={3} />
            예약
          </button>
          <button
            onClick={() => onSelect(f, 'calendar')}
            className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 p-2 md:p-3 rounded-xl md:rounded-2xl transition-all active:scale-95 flex items-center justify-center border border-slate-100"
            title="월간 달력"
          >
            <CalendarIcon size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

const TIME_SLOTS = [
  "0교시",
  "1교시",
  "2교시",
  "3교시",
  "4교시",
  "점심시간",
  "5교시",
  "6교시",
  "7교시",
  "방과후"
];

const DAYS = ["월", "화", "수", "목", "금"];

interface Facility {
  id: string;
  name: string;
  order: number;
  createdAt: Timestamp;
}

interface Reservation {
  id: string;
  facilityId: string;
  date: string; // YYYY-MM-DD
  timeSlot: number;
  duration: number;
  teacherName: string;
  reason: string;
  repeat?: 'none' | 'weekly';
  repeatUntil?: string; // YYYY-MM-DD
  createdAt: Timestamp;
}

// --- Utils ---

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekDates = (baseDate: Date) => {
  const dates: Date[] = [];
  const current = new Date(baseDate);
  const day = current.getDay();
  // Adjust to Monday (1). If Sun (0), go back 6 days.
  const diff = current.getDate() - day + (day === 0 ? -6 : 1); 
  const monday = new Date(new Date(current).setDate(diff));

  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null, // No auth implementation in this specific snippet yet
      email: null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Main Component ---

export default function App() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  
  const [isFacilityModalOpen, setIsFacilityModalOpen] = useState(false);
  const [isEditingFacility, setIsEditingFacility] = useState(false);
  const [editingFacilityId, setEditingFacilityId] = useState<string | null>(null);
  const [facilityNameInput, setFacilityNameInput] = useState('');

  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [teacherNameInput, setTeacherNameInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [startSlotInput, setStartSlotInput] = useState(0);
  const [endSlotInput, setEndSlotInput] = useState(0);
  const [repeatInput, setRepeatInput] = useState<'none' | 'weekly'>('none');
  const [repeatUntilInput, setRepeatUntilInput] = useState('');
  const [isEditingRes, setIsEditingRes] = useState(false);
  const [editingResId, setEditingResId] = useState<string | null>(null);
  const [pendingDeleteFacility, setPendingDeleteFacility] = useState<{id: string, name: string} | null>(null);
  const [pendingDeleteRes, setPendingDeleteRes] = useState<string | null>(null);

  const [currentView, setCurrentView] = useState<'list' | 'timetable' | 'calendar' | 'global_calendar'>('list');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [pendingRes, setPendingRes] = useState<{fId: string, date: string, slot: number} | null>(null);
  const [isResSuccess, setIsResSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const q = query(collection(db, 'facilities'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Facility));
      setFacilities(docs);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reservation));
      setReservations(docs);
    });
    return () => unsub();
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (isAdmin && over && active.id !== over.id) {
      const oldIndex = facilities.findIndex((f) => f.id === active.id);
      const newIndex = facilities.findIndex((f) => f.id === over.id);
      
      const newFacilities = arrayMove(facilities, oldIndex, newIndex) as Facility[];
      setFacilities(newFacilities);

      const batch = writeBatch(db);
      newFacilities.forEach((f, idx) => {
        const ref = doc(db, 'facilities', f.id);
        batch.update(ref, { order: idx });
      });
      await batch.commit();
    }
  };

  const handleAdminToggle = () => {
    if (isAdmin) {
      setIsAdmin(false);
    } else {
      setIsPasswordModalOpen(true);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === "1004") {
      setIsAdmin(true);
      setIsPasswordModalOpen(false);
      setPasswordInput('');
    } else {
      alert("비밀번호가 틀렸습니다.");
      setPasswordInput('');
    }
  };

  const addFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (facilityNameInput) {
      try {
        if (isEditingFacility && editingFacilityId) {
          await updateDoc(doc(db, 'facilities', editingFacilityId), {
            name: facilityNameInput
          });
        } else {
          await addDoc(collection(db, 'facilities'), {
            name: facilityNameInput,
            order: facilities.length,
            createdAt: serverTimestamp()
          });
        }
        setIsFacilityModalOpen(false);
        setIsEditingFacility(false);
        setEditingFacilityId(null);
        setFacilityNameInput('');
      } catch (err) {
        handleFirestoreError(err, isEditingFacility ? OperationType.UPDATE : OperationType.CREATE, 'facilities');
      }
    }
  };

  const deleteFacility = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'facilities', id));
      setPendingDeleteFacility(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `facilities/${id}`);
    }
  };

  const addReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherNameInput || !pendingRes) return;
    setErrorMessage(null);

    try {
      const duration = endSlotInput - startSlotInput + 1;
      
      // Conflict Check
      const conflict = reservations.find(r => {
        if (r.facilityId !== pendingRes.fId) return false;
        if (isEditingRes && r.id === editingResId) return false;

        const currentStart = startSlotInput;
        const currentEnd = endSlotInput;
        const rStart = r.timeSlot;
        const rEnd = r.timeSlot + r.duration - 1;

        // Check if slots overlap
        const slotsOverlap = (currentStart <= rEnd && currentEnd >= rStart);
        if (!slotsOverlap) return false;

        // Check date overlap
        const currentSelectedDate = new Date(pendingRes.date);
        const rDate = new Date(r.date);
        
        // Both are single date
        if (repeatInput === 'none' && (!r.repeat || r.repeat === 'none')) {
          return r.date === pendingRes.date;
        }

        // Check repeat overlap logic
        const getDatesOverlap = () => {
          // If both are weekly on same day
          if (repeatInput === 'weekly' && r.repeat === 'weekly') {
            if (currentSelectedDate.getDay() !== rDate.getDay()) return false;
            // Check if periods overlap
            const currentUntil = repeatUntilInput ? new Date(repeatUntilInput) : new Date(8640000000000000); 
            const rUntil = r.repeatUntil ? new Date(r.repeatUntil) : new Date(8640000000000000);
            return currentSelectedDate <= rUntil && rDate <= currentUntil;
          }
          
          // Current is weekly, R is single
          if (repeatInput === 'weekly') {
            if (currentSelectedDate.getDay() !== rDate.getDay()) return false;
            if (rDate < currentSelectedDate) return false;
            if (repeatUntilInput && rDate > new Date(repeatUntilInput)) return false;
            return true;
          }

          // Current is single, R is weekly
          if (r.repeat === 'weekly') {
            if (currentSelectedDate.getDay() !== rDate.getDay()) return false;
            if (currentSelectedDate < rDate) return false;
            if (r.repeatUntil && currentSelectedDate > new Date(r.repeatUntil)) return false;
            return true;
          }

          return false;
        };

        return getDatesOverlap();
      });

      if (conflict) {
        const conflictDate = conflict.repeat === 'weekly' ? `${DAYS[new Date(conflict.date).getDay()]}요일 반복` : conflict.date;
        const conflictTime = conflict.duration > 1 
          ? `${TIME_SLOTS[conflict.timeSlot]} ~ ${TIME_SLOTS[conflict.timeSlot + conflict.duration - 1]}`
          : TIME_SLOTS[conflict.timeSlot];
        
        setErrorMessage(`이미 예약된 시간입니다. (${conflictDate}, ${conflictTime} - ${conflict.teacherName})`);
        return;
      }

      const data: any = {
        facilityId: pendingRes.fId,
        date: pendingRes.date,
        timeSlot: startSlotInput,
        duration: duration,
        teacherName: teacherNameInput,
        reason: reasonInput,
        createdAt: serverTimestamp()
      };

      if (repeatInput !== 'none') {
        data.repeat = repeatInput;
        if (repeatUntilInput) {
          data.repeatUntil = repeatUntilInput;
        }
      }

      if (isEditingRes && editingResId) {
        await updateDoc(doc(db, 'reservations', editingResId), data);
      } else {
        await addDoc(collection(db, 'reservations'), data);
      }
      
      setIsResSuccess(true);
      setTimeout(() => {
        setIsReservationModalOpen(false);
        setIsResSuccess(false);
        setTeacherNameInput('');
        setReasonInput('');
        setRepeatInput('none');
        setRepeatUntilInput('');
        setIsEditingRes(false);
        setEditingResId(null);
        setPendingRes(null);
      }, 1500);
    } catch (err) {
      handleFirestoreError(err, isEditingRes ? OperationType.UPDATE : OperationType.CREATE, 'reservations');
    }
  };

  const deleteReservation = async (resId: string) => {
    try {
      await deleteDoc(doc(db, 'reservations', resId));
      setIsReservationModalOpen(false);
      setPendingDeleteRes(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `reservations/${resId}`);
    }
  };

  // --- Renderers ---

  const renderFacilityList = () => (
    <div className="p-4">
      {facilities.length === 0 && !isAdmin ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-300 mb-6">
            <School size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">등록된 시설이 없습니다.</h2>
          <p className="text-slate-500 max-w-sm text-sm">관리자 모드에서 시설을 등록하세요.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            <SortableContext items={facilities.map(f => f.id)} strategy={verticalListSortingStrategy}>
              <AnimatePresence>
                {facilities.map((f) => (
                  <SortableFacility 
                    key={f.id} f={f} isAdmin={isAdmin} 
                    setPendingDeleteFacility={setPendingDeleteFacility}
                    onSelect={(f, mode) => { setSelectedFacility(f); setCurrentView(mode); }}
                    onEdit={(f) => {
                      setEditingFacilityId(f.id);
                      setIsEditingFacility(true);
                      setFacilityNameInput(f.name);
                      setIsFacilityModalOpen(true);
                    }}
                  />
                ))}
              </AnimatePresence>
            </SortableContext>
            {isAdmin && (
              <motion.button
                onClick={() => setIsFacilityModalOpen(true)}
                className="border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center p-5 text-slate-400 hover:border-blue-400 transition-all hover:bg-blue-50/50 min-h-[160px]"
              >
                <Plus size={24} className="mb-2" />
                <span className="font-semibold text-sm">시설 추가</span>
              </motion.button>
            )}
          </div>
        </DndContext>
      )}
    </div>
  );

  // Simple hash function for consistent colors
  const getColorClass = (text: string) => {
    // 10 distinct variations of pastel blue-purples and periwinkles
    const purpleBlueGradient = [
      { bg: 'bg-[#EEF2FF]', text: 'text-[#3730A3]', border: 'border-[#C7D2FE]' }, // Indigo 50
      { bg: 'bg-[#F5F3FF]', text: 'text-[#5B21B6]', border: 'border-[#DDD6FE]' }, // Violet 50
      { bg: 'bg-[#FDF2F8]', text: 'text-[#9D174D]', border: 'border-[#FBCFE8]' }, // Pink (Soft)
      { bg: 'bg-[#F8F9FF]', text: 'text-[#312E81]', border: 'border-[#E0E7FF]' }, // Periwinkle 1
      { bg: 'bg-[#F0F4FF]', text: 'text-[#1E3A8A]', border: 'border-[#DBEAFE]' }, // Periwinkle 2
      { bg: 'bg-[#FAF5FF]', text: 'text-[#6B21A8]', border: 'border-[#F3E8FF]' }, // Purple 50
      { bg: 'bg-[#F1F5F9]', text: 'text-[#334155]', border: 'border-[#E2E8F0]' }, // Slate (Cool)
      { bg: 'bg-[#E0E7FF]', text: 'text-[#312E81]', border: 'border-[#C7D2FE]' }, // Indigo 100
      { bg: 'bg-[#EDE9FE]', text: 'text-[#4C1D95]', border: 'border-[#DDD6FE]' }, // Violet 100
      { bg: 'bg-[#F3E8FF]', text: 'text-[#6B21A8]', border: 'border-[#E9D5FF]' }, // Purple 100
    ];
    
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    return purpleBlueGradient[Math.abs(hash) % purpleBlueGradient.length];
  };

  const renderTimetable = () => {
    if (!selectedFacility) return null;
    const weekDates = getWeekDates(currentDate);
    const coveredMap: { [key: string]: boolean } = {};

    reservations.forEach(r => {
      if (r.facilityId !== selectedFacility.id) return;
      weekDates.forEach(d => {
        const dStr = formatDate(d);
        let match = (r.date === dStr);
        if (!match && r.repeat === 'weekly') {
          const rDate = new Date(r.date);
          const untilDate = r.repeatUntil ? new Date(r.repeatUntil) : null;
          match = rDate.getDay() === d.getDay() && d >= rDate && (!untilDate || d <= untilDate);
        }
        if (match && r.duration > 1) {
          for (let i = 1; i < r.duration; i++) coveredMap[`${dStr}-${r.timeSlot + i}`] = true;
        }
      });
    });

    return (
      <div className="p-2 md:p-4 max-w-full overflow-hidden">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 mb-4 bg-white p-3 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
            <button onClick={() => setCurrentView('list')} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600"><ChevronLeft size={18} /></button>
            <div className="truncate">
              <h1 className="text-lg md:text-xl font-bold text-slate-800 leading-tight truncate">{selectedFacility.name}</h1>
              <p className="text-slate-400 text-[9px] md:text-xs font-medium">주간 시간표</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 md:gap-4 w-full md:w-auto">
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 md:p-1 rounded-xl">
              <button 
                onClick={() => {
                  const newDate = new Date(currentDate);
                  newDate.setDate(newDate.getDate() - 7);
                  setCurrentDate(newDate);
                }} 
                className="p-1 hover:bg-white rounded-lg"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-bold text-slate-700 text-[10px] md:text-sm px-1 md:px-2">
                {weekDates[0].getMonth() + 1}/{weekDates[0].getDate()} ~ {weekDates[4].getMonth() + 1}/{weekDates[4].getDate()}
              </span>
              <button 
                onClick={() => {
                  const newDate = new Date(currentDate);
                  newDate.setDate(newDate.getDate() + 7);
                  setCurrentDate(newDate);
                }} 
                className="p-1 hover:bg-white rounded-lg"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="flex gap-1 md:gap-2">
              <button onClick={() => setCurrentView('calendar')} className="px-2 md:px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold flex items-center gap-1 border border-blue-100"><CalendarIcon size={12} className="md:w-3.5 md:h-3.5" /> <span className="hidden xs:inline">월간</span></button>
              <button onClick={() => setCurrentView('list')} className="px-2 md:px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold border border-slate-200">홈</button>
            </div>
          </div>
        </div>

        <div className="overflow-auto rounded-2xl border border-slate-200 shadow-sm bg-white max-h-[calc(100vh-280px)] md:max-h-[calc(100vh-250px)] relative scrollbar-hide">
          <div className="min-w-[500px] md:min-w-[800px] grid grid-cols-[45px_repeat(5,1fr)] md:grid-cols-[80px_repeat(5,1fr)]" style={{ gridTemplateRows: `auto repeat(${TIME_SLOTS.length}, minmax(45px, auto))` }}>
            {/* Header Row */}
            <div className="p-2 md:p-3 border-r border-b border-slate-200 bg-slate-50 font-bold text-slate-400 text-center text-[9px] md:text-[10px] uppercase tracking-wider sticky top-0 left-0 z-50">Time</div>
            {weekDates.map((date, i) => (
              <div key={i} className="p-2 md:p-3 border-r border-b border-slate-200 bg-slate-50 text-center sticky top-0 z-40">
                <div className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">{DAYS[i]}</div>
                <div className={`text-xs md:text-sm font-black ${formatDate(date) === formatDate(new Date()) ? "text-blue-600" : "text-slate-800"}`}>{date.getMonth() + 1}/{date.getDate()}</div>
              </div>
            ))}

            {/* Time Column (Sticky) */}
            {TIME_SLOTS.map((slot, slotIdx) => (
              <div 
                key={`time-${slotIdx}`} 
                className={`p-1 md:p-2 border-r border-b border-slate-100 flex items-center justify-center text-[9px] md:text-[11px] font-bold sticky left-0 z-40 ${slot.includes("점심") ? "bg-amber-50 text-amber-700" : "bg-white text-slate-500"}`}
                style={{ gridRow: slotIdx + 2, gridColumn: 1 }}
              >
                {slot}
              </div>
            ))}

            {/* Reservation Grid */}
            {weekDates.map((date, dayIdx) => {
              const dateStr = formatDate(date);
              return TIME_SLOTS.map((_, slotIdx) => {
                const key = `${dateStr}-${slotIdx}`;
                
                // Find reservation starting at this slot
                const res = reservations.find(r => {
                  if (r.facilityId !== selectedFacility.id || Number(r.timeSlot) !== slotIdx) return false;
                  if (r.date === dateStr) return true;
                  if (r.repeat === 'weekly') {
                    const rDate = new Date(r.date);
                    const untilDate = r.repeatUntil ? new Date(r.repeatUntil) : null;
                    return rDate.getDay() === date.getDay() && date >= rDate && (!untilDate || date <= untilDate);
                  }
                  return false;
                });

                if (res) {
                  const color = getColorClass(res.teacherName);
                  return (
                    <div 
                      key={`res-${key}`}
                      className="p-1 border-r border-b border-slate-100 relative group z-10"
                      style={{ 
                        gridColumn: dayIdx + 2, 
                        gridRow: `${slotIdx + 2} / span ${res.duration}` 
                      }}
                      onClick={() => {
                        setErrorMessage(null);
                        setEditingResId(res.id); setIsEditingRes(true);
                        setTeacherNameInput(res.teacherName); setReasonInput(res.reason);
                        setStartSlotInput(res.timeSlot); setEndSlotInput(res.timeSlot + res.duration - 1);
                        setRepeatInput(res.repeat || 'none'); setRepeatUntilInput(res.repeatUntil || '');
                        setPendingRes({ fId: res.facilityId, date: res.date, slot: res.timeSlot });
                        setIsReservationModalOpen(true);
                      }}
                    >
                      <div className={`h-full border ${color?.border} ${color?.bg} rounded-lg md:rounded-xl p-1 md:p-2 shadow-sm flex flex-col transition-transform hover:scale-[1.01] active:scale-100 cursor-pointer overflow-hidden`}>
                        <div className={`text-[10px] md:text-[12px] font-black ${color?.text} leading-tight mb-auto break-all line-clamp-3 md:line-clamp-4 uppercase tracking-tighter`}>{res.reason || "예약 사유 없음"}</div>
                        <div className={`text-[8px] md:text-[10px] ${color?.text} font-bold opacity-70 flex items-center gap-1 mt-0.5 md:mt-1 truncate`}><User size={8} strokeWidth={3} className="md:w-2.5 md:h-2.5" />{res.teacherName}</div>
                      </div>
                    </div>
                  );
                }

                // If this slot is covered by a span from a previous slot, don't render an empty cell
                if (coveredMap[key]) return null;

                // Render empty cell
                return (
                  <div 
                    key={`empty-${key}`}
                    className="p-1 border-r border-b border-slate-100 relative group hover:bg-slate-50/80 cursor-pointer"
                    style={{ gridColumn: dayIdx + 2, gridRow: slotIdx + 2 }}
                    onClick={() => {
                      setErrorMessage(null);
                      setEditingResId(null); setIsEditingRes(false);
                      setTeacherNameInput(''); setReasonInput('');
                      setStartSlotInput(slotIdx); setEndSlotInput(slotIdx);
                      setRepeatInput('none'); setRepeatUntilInput('');
                      setPendingRes({ fId: selectedFacility.id, date: dateStr, slot: slotIdx });
                      setIsReservationModalOpen(true);
                    }}
                  >
                    <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-slate-200"><Plus size={16} /></div>
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    if (!selectedFacility) return null;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    const padding = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < padding; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));

    return (
      <div className="p-2 md:p-4 max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 mb-4 md:mb-6 bg-white p-3 md:p-4 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto">
            <button onClick={() => setCurrentView('list')} className="p-1.5 md:p-2 hover:bg-slate-100 rounded-full"><ChevronLeft size={18} className="md:w-5 md:h-5" /></button>
            <div className="truncate">
              <h2 className="text-lg md:text-xl font-bold text-slate-800 truncate">{selectedFacility.name}</h2>
              <p className="text-slate-400 text-[9px] md:text-[10px] font-medium leading-none">월간 현황</p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-3 md:gap-6 w-full md:w-auto">
            <div className="flex items-center gap-2 md:gap-4 bg-slate-50 p-1 rounded-xl md:bg-transparent md:p-0">
              <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-1.5 md:p-2 hover:bg-slate-100 rounded-xl"><ChevronLeft size={18} className="md:w-5 md:h-5" /></button>
              <span className="font-black text-sm md:text-xl text-slate-800 w-24 md:w-32 text-center">{year}년 {month + 1}월</span>
              <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-1.5 md:p-2 hover:bg-slate-100 rounded-xl"><ChevronRight size={18} className="md:w-5 md:h-5" /></button>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button onClick={() => setCurrentView('timetable')} className="flex-1 md:flex-none px-2 md:px-4 py-2 bg-blue-600 text-white rounded-lg md:rounded-xl text-[9px] md:text-sm font-bold shadow-md shadow-blue-100">주간보기</button>
              <button onClick={() => setCurrentView('list')} className="flex-1 md:flex-none px-2 md:px-4 py-2 bg-slate-100 text-slate-600 rounded-lg md:rounded-xl text-[9px] md:text-sm font-bold border border-slate-200">홈으로</button>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-7 bg-slate-50/50 border-b border-slate-100 text-center font-black text-xs text-slate-500 py-4">
            {["월", "화", "수", "목", "금", "토", "일"].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 grid-rows-[repeat(6,1fr)] min-h-[600px]">
            {days.map((date, i) => {
              if (!date) return <div key={i} className="border-r border-b border-slate-50" />;
              const dStr = formatDate(date);
              const dayRes = reservations.filter(r => {
                if (r.facilityId !== selectedFacility.id) return false;
                if (r.date === dStr) return true;
                if (r.repeat === 'weekly') {
                  const rDate = new Date(r.date);
                  return rDate.getDay() === date.getDay() && date >= rDate && (!r.repeatUntil || date <= new Date(r.repeatUntil));
                }
                return false;
              });
              const isToday = formatDate(new Date()) === dStr;
              return (
                <div key={i} className="border-r border-b border-slate-50 p-2 hover:bg-slate-50 transition-all cursor-pointer" onClick={() => { setCurrentDate(date); setCurrentView('timetable'); }}>
                  <div className="mb-1"><span className={`text-sm font-black w-7 h-7 flex items-center justify-center rounded-lg ${isToday ? "bg-blue-600 text-white" : "text-slate-400"}`}>{date.getDate()}</span></div>
                  <div className="space-y-1">
                    {dayRes.map((res, idx) => {
                      const color = getColorClass(res.teacherName);
                      return (
                        <div key={idx} className={`text-[10px] font-black ${color.bg} ${color.text} px-1.5 py-0.5 rounded-lg truncate`}>
                          <span className="hidden md:inline mr-1 opacity-60">[{TIME_SLOTS[res.timeSlot]}]</span>
                          {res.reason}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderGlobalCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    const padding = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < padding; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));

    return (
      <div className="p-2 md:p-4 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 mb-4 md:mb-6 bg-white p-3 md:p-4 rounded-2xl border border-slate-200 text-center">
          <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
            <button onClick={() => setCurrentView('list')} className="p-1.5 md:p-2 hover:bg-slate-100 rounded-full"><ChevronLeft size={18} className="md:w-5 md:h-5" /></button>
            <h2 className="text-lg md:text-xl font-black text-slate-800 truncate">전체 예약 현황</h2>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-3 md:gap-6 w-full md:w-auto">
            <div className="flex items-center gap-2 md:gap-4 bg-slate-50 p-1 rounded-xl md:bg-transparent md:p-0">
              <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-1 md:p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft size={16} className="md:w-5 md:h-5" /></button>
              <span className="font-black text-xs md:text-xl text-slate-800 w-20 md:w-32 text-center">{year}년 {month + 1}월</span>
              <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-1 md:p-2 hover:bg-slate-100 rounded-lg"><ChevronRight size={16} className="md:w-5 md:h-5" /></button>
            </div>
            <button onClick={() => setCurrentView('list')} className="w-full md:w-auto px-4 md:px-6 py-2 bg-slate-900 text-white rounded-lg md:rounded-xl text-[9px] md:text-sm font-bold shadow-md shadow-slate-200 transition-all active:scale-[0.98]">목록으로</button>
          </div>
        </div>
        <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100 text-center py-4 text-xs font-black text-slate-500">
            {["월", "화", "수", "목", "금", "토", "일"].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 grid-rows-[repeat(6,1fr)] min-h-[700px]">
            {days.map((date, i) => {
              if (!date) return <div key={i} className="border-r border-b border-slate-50 bg-slate-50/20" />;
              const dStr = formatDate(date);
              const dayRes = reservations.filter(r => {
                if (r.date === dStr) return true;
                if (r.repeat === 'weekly') {
                  const rDate = new Date(r.date);
                  return rDate.getDay() === date.getDay() && date >= rDate && (!r.repeatUntil || date <= new Date(r.repeatUntil));
                }
                return false;
              });
              return (
                <div key={i} className="border-r border-b border-slate-50 p-2 hover:bg-slate-50 flex flex-col overflow-hidden">
                  <div className="mb-2"><span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-lg ${formatDate(new Date()) === dStr ? "bg-blue-600 text-white" : "text-slate-400"}`}>{date.getDate()}</span></div>
                  <div className="space-y-1.5 overflow-hidden">
                    {dayRes.map((res, idx) => {
                      const facility = facilities.find(f => f.id === res.facilityId);
                      const color = getColorClass(res.facilityId);
                      return (
                        <div key={idx} className={`border ${color.border} rounded-lg p-1 ${color.bg} shadow-sm flex flex-col overflow-hidden`}>
                          <div className={`text-[8px] font-black ${color.text} truncate opacity-70 bg-white/50 px-1 rounded`}>{facility?.name || "???"}</div>
                          <div className={`text-[9px] font-bold ${color.text} truncate px-0.5`}>{res.reason}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 px-4 md:px-6 py-3 md:py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => setCurrentView('list')}>
          <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-600 rounded-lg md:rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100"><School size={18} className="md:w-5.5 md:h-5.5" /></div>
          <div className="flex flex-col">
            <h1 className="text-lg md:text-xl font-black tracking-tighter leading-none flex items-baseline">
              <span className="text-slate-900 mr-1 md:mr-1.5">인비고</span>
              <span className="text-blue-600">자리ON</span>
              {isAdmin && (
                <span className="ml-1.5 px-1 md:px-1.5 py-0.5 bg-slate-900 text-white text-[8px] md:text-[9px] font-black rounded uppercase tracking-tighter shadow-sm">
                  AD
                </span>
              )}
            </h1>
            <span className="text-[9px] md:text-[10px] font-bold text-slate-400 mt-0.5">학교 시설 예약 시스템</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-4">
          <button onClick={() => setCurrentView('global_calendar')} className="flex px-2 md:px-4 py-2 bg-slate-50 text-slate-600 rounded-lg md:rounded-xl text-[10px] md:text-sm font-bold items-center gap-1 md:gap-2 border border-slate-100 shadow-sm transition-all hover:bg-blue-50 hover:text-blue-600">
            <CalendarIcon size={14} className="md:w-4 md:h-4" /> 
            <span className="hidden md:inline">전체 예약 현황</span>
            <span className="md:hidden">현황</span>
          </button>
          <button onClick={handleAdminToggle} className={`px-2 md:px-4 py-2 rounded-lg md:rounded-xl text-[10px] md:text-sm font-bold flex items-center gap-1 md:gap-2 transition-all border ${isAdmin ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"}`}>
            <Settings size={14} className="md:w-3.5 md:h-3.5" />
            {isAdmin ? "관리" : "설정"}
          </button>
        </div>
      </header>

      <main className="container mx-auto py-8">
        {currentView === 'list' && renderFacilityList()}
        {currentView === 'timetable' && renderTimetable()}
        {currentView === 'calendar' && renderCalendar()}
        {currentView === 'global_calendar' && renderGlobalCalendar()}
      </main>

      <AnimatePresence>
        {isPasswordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsPasswordModalOpen(false)} className="absolute inset-0 bg-slate-900/60" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h3 className="text-2xl font-bold mb-4">관리자 인증</h3>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="비밀번호" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl outline-none" />
                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg">인증</button>
              </form>
            </motion.div>
          </div>
        )}

        {isFacilityModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setIsFacilityModalOpen(false); setIsEditingFacility(false); setEditingFacilityId(null); setFacilityNameInput(''); }} className="absolute inset-0 bg-slate-900/60" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white rounded-3xl p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h3 className="text-2xl font-bold mb-4">{isEditingFacility ? '시설 이름 수정' : '시설 추가'}</h3>
              <form onSubmit={addFacility} className="space-y-4">
                <input type="text" value={facilityNameInput} onChange={e => setFacilityNameInput(e.target.value)} placeholder="시설 이름" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl" />
                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl">{isEditingFacility ? '수정' : '등록'}</button>
              </form>
            </motion.div>
          </div>
        )}

        {isReservationModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsReservationModalOpen(false)} className="absolute inset-0 bg-slate-900/60" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {isResSuccess ? (
                <div className="text-center py-12"><h4 className="text-2xl font-black mb-2 text-green-600">예약 완료!</h4><p className="text-slate-500">정상적으로 처리되었습니다.</p></div>
              ) : (
                <form onSubmit={addReservation} className="space-y-4">
                  <h3 className="text-lg md:text-xl font-bold mb-4">{isEditingRes ? '예약 상세 및 수정' : '예약 신청'}</h3>
                  <div className="grid grid-cols-2 gap-2 md:gap-3">
                    <div className="p-2 md:p-3 bg-blue-50/50 rounded-xl font-bold text-[9px] md:text-xs text-blue-700 border border-blue-100 truncate">날짜: {pendingRes?.date}</div>
                    <div className="p-2 md:p-3 bg-amber-50/50 rounded-xl font-bold text-[9px] md:text-xs text-amber-700 truncate border border-amber-100">시설: {facilities.find(f => f.id === pendingRes?.fId)?.name}</div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">예약 사유</label>
                    <input type="text" value={reasonInput} onChange={e => setReasonInput(e.target.value)} placeholder="예약 내용을 입력하세요" required className="w-full px-4 py-2 md:py-2.5 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs md:text-sm outline-none focus:border-blue-200 transition-colors" />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">신청인</label>
                      <input type="text" value={teacherNameInput} onChange={e => setTeacherNameInput(e.target.value)} placeholder="성함" required className="w-full px-4 py-2 md:py-2.5 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs md:text-sm outline-none focus:border-blue-200 transition-colors" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">예약 유형</label>
                      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                        <button type="button" onClick={() => setRepeatInput('none')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${repeatInput === 'none' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>한 번</button>
                        <button type="button" onClick={() => setRepeatInput('weekly')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${repeatInput === 'weekly' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400'}`}>반복</button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">교시 선택 (시작 ~ 종료)</label>
                    <div className="grid grid-cols-5 gap-1">
                      {TIME_SLOTS.map((s, i) => {
                        const isSelected = i >= startSlotInput && i <= endSlotInput;
                        const isStart = i === startSlotInput;
                        const isEnd = i === endSlotInput;
                        const isBound = isStart || isEnd;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              if (startSlotInput === endSlotInput) {
                                if (i < startSlotInput) {
                                  setStartSlotInput(i);
                                } else {
                                  setEndSlotInput(i);
                                }
                              } else {
                                setStartSlotInput(i);
                                setEndSlotInput(i);
                              }
                            }}
                            className={`py-1.5 md:py-2 rounded-lg text-[9px] md:text-[11px] font-bold transition-all border relative ${
                              isBound ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 
                              isSelected ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                              'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
                            }`}
                          >
                            <span className="truncate block px-0.5">{s.replace('교시', '').replace('시간', '')}</span>
                            {isStart && <span className="absolute -top-1 -left-1 bg-white text-blue-600 text-[7px] px-1 rounded border border-blue-200 shadow-sm">S</span>}
                            {isEnd && <span className="absolute -top-1 -right-1 bg-white text-blue-600 text-[7px] px-1 rounded border border-blue-200 shadow-sm">E</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {repeatInput === 'weekly' && (
                    <div className="p-3 bg-blue-50/30 rounded-2xl border border-blue-100 space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-black text-blue-700 px-1">
                        <span>종료일</span>
                        <span className="text-blue-400 font-bold">매주 {DAYS[new Date(pendingRes?.date || '').getDay() === 0 ? 0 : new Date(pendingRes?.date || '').getDay() - 1]}요일 반복</span>
                      </div>
                      <input 
                        type="date" 
                        value={repeatUntilInput} 
                        onChange={e => setRepeatUntilInput(e.target.value)} 
                        className="w-full p-2 bg-white border border-blue-100 rounded-lg font-bold text-xs text-blue-900 outline-none" 
                      />
                    </div>
                  )}

                  {errorMessage && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      className="bg-rose-50 text-rose-600 text-[11px] font-bold p-3 rounded-xl border border-rose-100 flex items-center gap-2"
                    >
                      <X size={14} className="bg-rose-600 text-white rounded-full p-0.5" />
                      {errorMessage}
                    </motion.div>
                  )}
                  
                  <div className="flex gap-2 mt-4">
                    {isEditingRes && (
                      pendingDeleteRes === editingResId ? (
                        <div className="flex-1 flex gap-2">
                          <button type="button" onClick={() => deleteReservation(editingResId)} className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl text-xs">삭제 확인</button>
                          <button type="button" onClick={() => setPendingDeleteRes(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl text-xs">취소</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setPendingDeleteRes(editingResId)} className="px-3 py-2.5 bg-red-50 text-red-500 font-bold rounded-xl flex items-center gap-1 border border-red-100"><Trash2 size={14} />삭제</button>
                      )
                    )}
                    {!pendingDeleteRes && (
                      <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-blue-100 transition-all active:scale-[0.98] truncate whitespace-nowrap px-2">
                        {isEditingRes ? '내용 저장' : '예약 완료'}
                      </button>
                    )}
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
        {pendingDeleteFacility && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPendingDeleteFacility(null)} className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2">시설 삭제 확인</h3>
              <p className="text-slate-500 text-sm mb-8">
                '<strong>{pendingDeleteFacility.name}</strong>' 시설을 정말 삭제하시겠습니까?<br/>
                이 작업은 되돌릴 수 없습니다.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setPendingDeleteFacility(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl">취소</button>
                <button onClick={() => deleteFacility(pendingDeleteFacility.id)} className="flex-1 py-4 bg-rose-600 text-white font-bold rounded-2xl shadow-lg shadow-rose-100">삭제하기</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t p-3 md:p-4 flex justify-center items-center gap-2 text-slate-400 text-[9px] md:text-[10px] font-medium shadow-sm z-30">
        <School size={10} className="md:w-3 md:h-3" />
        <span>인비고 자리ON v1.0.1</span>
        <span className="mx-1 md:mx-2 opacity-30">|</span>
        <span className="truncate">&copy; 2026 <strong className="text-slate-500">INBIGO</strong> All Rights Reserved.</span>
      </footer>
    </div>
  );
}
