import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createNavigationContainerRef,
  NavigationContainer,
  RouteProp,
} from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  api,
  getMe,
  login,
  registerDeviceToken,
  unregisterDeviceToken,
} from "./src/lib/api";
import {
  loadRoomQueue,
  QueuedMessage,
  removeQueueItem,
  upsertQueueItem,
} from "./src/lib/offlineQueue";
import { disconnectRealtimeSocket, getRealtimeSocket } from "./src/lib/realtime";
import { clearToken, getToken, saveToken } from "./src/lib/tokenStorage";
import { User, UserRole } from "./src/types/auth";
import DashboardNativeScreen from "./src/screens/DashboardNativeScreen";
import QrNativeScreen from "./src/screens/QrNativeScreen";
import MaterialsScreenNative from "./src/screens/MaterialsNativeScreen";
import TasksScreenNative from "./src/screens/TasksNativeScreen";
import WorkspaceNativeScreen from "./src/screens/WorkspaceNativeScreen";
import WorkspaceRoomChatNativeScreen from "./src/screens/WorkspaceRoomChatNativeScreen";
import SubjectMaterialsNativeScreen from "./src/screens/SubjectMaterialsNativeScreen";
import AccountNativeScreen from "./src/screens/AccountNativeScreen";
import LoginNativeScreen from "./src/screens/LoginNativeScreen";
import BootLoadingScreen from "./src/screens/BootLoadingScreen";
import MainTabsNavigator from "./src/components/MainTabsNavigator";

type WorkspaceRoomProfileScreenProps = {
  token: string;
  user: User;
  route?: any;
  navigation?: any;
};

const WorkspaceRoomProfileNativeScreen = require("./src/screens/WorkspaceRoomProfileNativeScreen").default as ComponentType<WorkspaceRoomProfileScreenProps>;

// Lazy-load MaterialViewerNativeScreen to prevent NativeEventEmitter error in Expo Go
type MaterialViewerScreenProps = {
  token: string;
  user: User;
  route?: any;
  navigation?: any;
};

const MaterialViewerFallback = require("./src/screens/MaterialViewerNativeScreen.expo").default as ComponentType<MaterialViewerScreenProps>;
let MaterialViewerNativeScreen: ComponentType<MaterialViewerScreenProps> = MaterialViewerFallback;
try {
  MaterialViewerNativeScreen = require("./src/screens/MaterialViewerNativeScreen").default as ComponentType<MaterialViewerScreenProps>;
} catch (e) {
  // Fallback for Expo Go (native modules not available).
}

type PageItem = {
  key: string;
  title: string;
  subtitle: string;
  path: string;
};

const BRAND = {
  primary: "#03468F",
  primaryDark: "#20466F",
  primaryDimmed: "#E1E9F2",
  secondary: "#FFE288",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#171717",
  textMuted: "#64748B",
  border: "#D7E2EE",
  success: "#16A34A",
  danger: "#DC2626",
};

const SCREEN_SIDE_PADDING = 16;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const allDashboardPages: PageItem[] = [
  { key: "dashboard-home", title: "Dashboard", subtitle: "Main dashboard home", path: "/dashboard" },
  { key: "academic", title: "Academic", subtitle: "Academic overview page", path: "/dashboard/academic" },
  { key: "assistant-attendance", title: "Assistant Attendance", subtitle: "Assistant attendance page", path: "/dashboard/assistant-attendance" },
  { key: "assistant-qr-codes", title: "Assistant QR Codes", subtitle: "Assistant QR codes page", path: "/dashboard/assistant-qr-codes" },
  { key: "assistant-scanner", title: "Assistant Scanner", subtitle: "Assistant scanner page", path: "/dashboard/assistant-scanner" },
  { key: "attendance", title: "Attendance", subtitle: "Attendance management page", path: "/dashboard/attendance" },
  { key: "cheating-detection", title: "Cheating Detection", subtitle: "Cheating detection page", path: "/dashboard/cheating-detection" },
  { key: "colleges", title: "Colleges", subtitle: "Colleges management page", path: "/dashboard/colleges" },
  { key: "departments", title: "Departments", subtitle: "Departments management page", path: "/dashboard/departments" },
  { key: "developers", title: "Developers", subtitle: "Developers list page", path: "/dashboard/developers" },
  { key: "developers-slug", title: "Developer Details", subtitle: "Developer dynamic page", path: "/dashboard/developers/[slug]" },
  { key: "doctors", title: "Doctors", subtitle: "Doctors management page", path: "/dashboard/doctors" },
  { key: "lectures", title: "Lectures", subtitle: "Lectures page", path: "/dashboard/lectures" },
  { key: "levels", title: "Levels", subtitle: "Levels management page", path: "/dashboard/levels" },
  { key: "materials", title: "Materials", subtitle: "Materials page", path: "/dashboard/materials" },
  { key: "materials-subject", title: "Materials By Subject", subtitle: "Subject materials dynamic page", path: "/dashboard/materials/subject/[subjectId]" },
  { key: "materials-view", title: "Materials Viewer", subtitle: "Materials view page", path: "/dashboard/materials/view" },
  { key: "my-attendance", title: "My Attendance", subtitle: "My attendance page", path: "/dashboard/my-attendance" },
  { key: "my-qr", title: "My QR", subtitle: "My QR page", path: "/dashboard/my-qr" },
  { key: "my-subjects", title: "My Subjects", subtitle: "My subjects page", path: "/dashboard/my-subjects" },
  { key: "notifications", title: "Notifications", subtitle: "Notifications page", path: "/dashboard/notifications" },
  { key: "profile", title: "Profile", subtitle: "Profile page", path: "/dashboard/profile" },
  { key: "qr-code", title: "QR Code", subtitle: "QR code page", path: "/dashboard/qr-code" },
  { key: "qr-codes", title: "QR Codes", subtitle: "QR codes page", path: "/dashboard/qr-codes" },
  { key: "scanner", title: "Scanner", subtitle: "Scanner page", path: "/dashboard/scanner" },
  { key: "sections", title: "Sections", subtitle: "Sections management page", path: "/dashboard/sections" },
  { key: "staff", title: "Staff", subtitle: "Staff management page", path: "/dashboard/staff" },
  { key: "staff-attendance", title: "Staff Attendance", subtitle: "Staff attendance page", path: "/dashboard/staff-attendance" },
  { key: "student-tracking", title: "Student Tracking", subtitle: "Student tracking page", path: "/dashboard/student-tracking" },
  { key: "students", title: "Students", subtitle: "Students management page", path: "/dashboard/students" },
  { key: "subjects", title: "Subjects", subtitle: "Subjects management page", path: "/dashboard/subjects" },
  { key: "submissions", title: "Submissions", subtitle: "Submissions page", path: "/dashboard/submissions" },
  { key: "tasks", title: "Tasks", subtitle: "Tasks page", path: "/dashboard/tasks" },
  { key: "timetable", title: "Timetable", subtitle: "Timetable page", path: "/dashboard/timetable" },
  { key: "unauthorized", title: "Unauthorized", subtitle: "Unauthorized page", path: "/dashboard/unauthorized" },
  { key: "universities", title: "Universities", subtitle: "Universities management page", path: "/dashboard/universities" },
  { key: "upload", title: "Upload", subtitle: "Upload page", path: "/dashboard/upload" },
  { key: "users", title: "Users", subtitle: "Users management page", path: "/dashboard/users" },
  { key: "workspace", title: "Workspace", subtitle: "Workspace root page", path: "/dashboard/workspace" },
  { key: "workspace-room", title: "Workspace Room", subtitle: "Workspace room dynamic page", path: "/dashboard/workspace/[roomId]" },
  { key: "workspace-call", title: "Workspace Call", subtitle: "Workspace call page", path: "/dashboard/workspace/[roomId]/call" },
  { key: "workspaces", title: "Workspaces", subtitle: "Workspaces root page", path: "/dashboard/workspaces" },
  { key: "workspaces-room", title: "Workspaces Room", subtitle: "Workspaces room dynamic page", path: "/dashboard/workspaces/[roomId]" },
  { key: "workspaces-call", title: "Workspaces Call", subtitle: "Workspaces call page", path: "/dashboard/workspaces/[roomId]/call" },
  { key: "workspaces-notifications", title: "Workspaces Notifications", subtitle: "Workspaces notifications section", path: "/dashboard/workspaces/[roomId]/notifications" },
  { key: "workspaces-pinned", title: "Workspaces Pinned", subtitle: "Workspaces pinned section", path: "/dashboard/workspaces/[roomId]/pinned" },
  { key: "workspaces-search", title: "Workspaces Search", subtitle: "Workspaces search page", path: "/dashboard/workspaces/[roomId]/search" },
];

function getPagesForRole(role: UserRole): PageItem[] {
  return allDashboardPages;
}

function toArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.subjects)) return value.subjects;
  if (Array.isArray(value?.students)) return value.students;
  if (Array.isArray(value?.lectures)) return value.lectures;
  return [];
}

function authHeaders(token: string) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

function resolveUploadUrl(fileUrl?: string | null) {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("file://") || fileUrl.startsWith("content://")) {
    return fileUrl;
  }
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;

  const base = String(api.defaults.baseURL || "https://attendqr.tech/api").replace(
    /\/api\/?$/,
    "",
  );

  return `${base}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

type RootStackParamList = {
  Main: undefined;
  PageDetails: { page: PageItem };
  ScannerNative: undefined;
  QrNative: undefined;
  DashboardNative: undefined;
  AttendanceNative: undefined;
  LecturesNative: undefined;
  StudentsNative: undefined;
  SubjectsNative: undefined;
  TasksNative: undefined;
  NotificationsNative: undefined;
  TimetableNative: undefined;
  MaterialsNative: undefined;
  SubjectMaterialsNative: { subjectId: number };
  MaterialViewerNative: { id: number; title?: string; type?: string; url?: string };
  SubmissionsNative: undefined;
  StaffAttendanceNative: undefined;
  MyAttendanceNative: undefined;
  WorkspacesNative: undefined;
  WorkspaceRoomNative: { roomId: number; roomName?: string };
  WorkspaceRoomProfileNative: { roomId: number; roomName?: string };
  WorkspaceCallNative: { roomId: number; roomName?: string; callType: "voice" | "video"; callId?: number };
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

const nativeRouteByKey: Partial<Record<PageItem["key"], keyof RootStackParamList>> = {
  "dashboard-home": "DashboardNative",
  scanner: "ScannerNative",
  qr: "QrNative",
  "assistant-scanner": "ScannerNative",
  attendance: "AttendanceNative",
  lectures: "LecturesNative",
  students: "StudentsNative",
  subjects: "SubjectsNative",
  tasks: "TasksNative",
  notifications: "NotificationsNative",
  timetable: "TimetableNative",
  materials: "MaterialsNative",
  submissions: "SubmissionsNative",
  "staff-attendance": "StaffAttendanceNative",
  "my-attendance": "MyAttendanceNative",
  workspace: "WorkspacesNative",
  workspaces: "WorkspacesNative",
};

function HomeScreen({ user }: { user: User }) {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>Welcome, {user.name}</Text>
      <Text style={styles.subtitle}>Role: {user.role}</Text>
      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Native Migration Active</Text>
        <Text style={styles.noticeText}>
          This app is now fully React Native. Pages are organized by your role and
          will be implemented one by one with native UI.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function AttendanceNativeScreen({ token, user }: { token: string; user: User }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [records, setRecords] = useState<any[]>([]);

  const fetchSubjects = useCallback(async () => {
    const res = await api.get("/subjects", authHeaders(token));
    const rows = toArray(res.data);
    setSubjects(rows);
    if (!selectedSubjectId && rows.length > 0) {
      setSelectedSubjectId(rows[0].id);
    }
  }, [selectedSubjectId, token]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (user.role === "student") {
        const res = await api.get("/attendance/my-attendance", authHeaders(token));
        setRecords(toArray(res.data));
      } else if (user.role === "employee") {
        const res = await api.get("/staff-attendance", authHeaders(token));
        setRecords(toArray(res.data));
      } else {
        await fetchSubjects();
        const subjectId = selectedSubjectId || subjects[0]?.id;
        if (!subjectId) {
          setRecords([]);
        } else {
          const res = await api.get(
            `/attendance/subject/${subjectId}`,
            authHeaders(token),
          );
          setRecords(toArray(res.data));
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load attendance.");
    } finally {
      setLoading(false);
    }
  }, [fetchSubjects, selectedSubjectId, subjects, token, user.role]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>Attendance</Text>
      <Text style={styles.subtitle}>Role-aware attendance data</Text>

      {subjects.length > 0 && user.role !== "student" && user.role !== "employee" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipsRow}>
            {subjects.map((sub) => {
              const selected = selectedSubjectId === sub.id;
              return (
                <Pressable
                  key={String(sub.id)}
                  onPress={() => setSelectedSubjectId(sub.id)}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {sub.name || `Subject ${sub.id}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      <Pressable onPress={fetchRecords} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={records}
        keyExtractor={(item, idx) => String(item?.id || item?.student_id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.pageCard}>
            <Text style={styles.pageTitle}>{item?.student_name || item?.name || "Attendance Row"}</Text>
            <Text style={styles.pageSubtitle}>
              {item?.status || item?.attendance_status || item?.date || "No extra data"}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function LecturesNativeScreen({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [lectures, setLectures] = useState<any[]>([]);

  const fetchSubjects = useCallback(async () => {
    const res = await api.get("/subjects", authHeaders(token));
    const rows = toArray(res.data);
    setSubjects(rows);
    if (!selectedSubjectId && rows.length > 0) {
      setSelectedSubjectId(rows[0].id);
    }
  }, [selectedSubjectId, token]);

  const fetchLectures = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchSubjects();
      const subjectId = selectedSubjectId || subjects[0]?.id;
      if (!subjectId) {
        setLectures([]);
      } else {
        const res = await api.get(
          `/lectures?subject_id=${subjectId}`,
          authHeaders(token),
        );
        setLectures(toArray(res.data));
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load lectures.");
    } finally {
      setLoading(false);
    }
  }, [fetchSubjects, selectedSubjectId, subjects, token]);

  useEffect(() => {
    fetchLectures();
  }, [fetchLectures]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>Lectures</Text>
      <Text style={styles.subtitle}>Subjects and lecture sessions</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipsRow}>
          {subjects.map((sub) => {
            const selected = selectedSubjectId === sub.id;
            return (
              <Pressable
                key={String(sub.id)}
                onPress={() => setSelectedSubjectId(sub.id)}
                style={[styles.chip, selected && styles.chipActive]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                  {sub.name || `Subject ${sub.id}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Pressable onPress={fetchLectures} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={lectures}
        keyExtractor={(item, idx) => String(item?.id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.pageCard}>
            <Text style={styles.pageTitle}>{item?.title || item?.name || "Lecture"}</Text>
            <Text style={styles.pageSubtitle}>
              {item?.started_at || item?.created_at || "No timestamp"}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function StudentsNativeScreen({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/students", authHeaders(token));
      setStudents(toArray(res.data));
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load students.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((row) => {
      const name = String(row?.name || row?.student_name || "").toLowerCase();
      const code = String(row?.code || row?.student_code || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [search, students]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>Students</Text>
      <Text style={styles.subtitle}>Students list and quick search</Text>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name or code"
        style={styles.searchInput}
      />

      <Pressable onPress={fetchStudents} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(item, idx) => String(item?.id || item?.user_id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.pageCard}>
            <Text style={styles.pageTitle}>{item?.name || item?.student_name || "Student"}</Text>
            <Text style={styles.pageSubtitle}>{item?.code || item?.student_code || "No code"}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function SubjectsNativeScreen({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<any[]>([]);

  const fetchSubjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subjectsRes, levelsRes] = await Promise.all([
        api.get("/subjects", authHeaders(token)),
        api.get("/levels", authHeaders(token)),
      ]);

      const subjectRows = toArray(subjectsRes.data);
      const levelsRows = toArray(levelsRes.data);
      const levelMap = new Map(levelsRows.map((lvl: any) => [lvl.id, lvl.name]));

      const merged = subjectRows.map((sub: any) => ({
        ...sub,
        level_name: levelMap.get(sub.level_id) || sub.level_name,
      }));
      setSubjects(merged);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load subjects.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>Subjects</Text>
      <Text style={styles.subtitle}>Subjects with level mapping</Text>

      <Pressable onPress={fetchSubjects} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={subjects}
        keyExtractor={(item, idx) => String(item?.id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.pageCard}>
            <Text style={styles.pageTitle}>{item?.name || "Subject"}</Text>
            <Text style={styles.pageSubtitle}>{item?.level_name || "No level"}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function TasksNativeScreen({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, subjectsRes] = await Promise.all([
        api.get("/tasks", authHeaders(token)),
        api.get("/subjects", authHeaders(token)),
      ]);

      const taskRows = toArray(tasksRes.data);
      const subjectRows = toArray(subjectsRes.data);
      setTasks(taskRows);
      setSubjects(subjectRows);

      if (!selectedSubjectId && subjectRows.length > 0) {
        setSelectedSubjectId(subjectRows[0].id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [selectedSubjectId, token]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const filteredTasks = useMemo(() => {
    if (!selectedSubjectId) return tasks;
    return tasks.filter((row) => Number(row?.subject_id) === Number(selectedSubjectId));
  }, [selectedSubjectId, tasks]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>Tasks</Text>
      <Text style={styles.subtitle}>Tasks and assignment list</Text>

      {subjects.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipsRow}>
            {subjects.map((sub) => {
              const selected = selectedSubjectId === sub.id;
              return (
                <Pressable
                  key={String(sub.id)}
                  onPress={() => setSelectedSubjectId(sub.id)}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {sub.name || `Subject ${sub.id}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      <Pressable onPress={fetchTasks} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={filteredTasks}
        keyExtractor={(item, idx) => String(item?.id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.pageCard}>
            <Text style={styles.pageTitle}>{item?.title || item?.name || "Task"}</Text>
            <Text style={styles.pageSubtitle}>
              {item?.subject_name || `Subject ID: ${item?.subject_id || "-"}`}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function NotificationsNativeScreen({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/notifications", authHeaders(token));
      setItems(toArray(res.data));
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = useCallback(
    async (id: number) => {
      try {
        await api.put(`/notifications/${id}/read`, {}, authHeaders(token));
        setItems((prev) =>
          prev.map((n) => (Number(n?.id) === Number(id) ? { ...n, is_read: 1 } : n)),
        );
      } catch {
        // Keep UI stable if endpoint fails.
      }
    },
    [token],
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await api.put("/notifications/read-all", {}, authHeaders(token));
      setItems((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch {
      // Keep UI stable if endpoint fails.
    }
  }, [token]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>Notifications</Text>
      <Text style={styles.subtitle}>Live notification center</Text>

      <View style={styles.rowActions}>
        <Pressable onPress={fetchNotifications} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
        <Pressable onPress={markAllAsRead} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Read All</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item, idx) => String(item?.id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const unread = !item?.is_read;
          return (
            <Pressable
              onPress={() => unread && item?.id && markAsRead(item.id)}
              style={[styles.pageCard, unread && styles.unreadCard]}
            >
              <Text style={styles.pageTitle}>{item?.title || "Notification"}</Text>
              <Text style={styles.pageSubtitle}>
                {item?.message || item?.content || "No message"}
              </Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function TimetableNativeScreen({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const fetchTimetable = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tableRes, subjectsRes] = await Promise.all([
        api.get("/timetable", authHeaders(token)),
        api.get("/subjects", authHeaders(token)),
      ]);

      const tableRows = toArray(tableRes.data);
      const subjectRows = toArray(subjectsRes.data);
      const subjectMap = new Map(subjectRows.map((s: any) => [s.id, s.name]));

      const mapped = tableRows.map((row: any) => ({
        ...row,
        subject_name: subjectMap.get(row.subject_id) || row.subject_name,
      }));

      setRows(mapped);
      setSubjects(subjectRows);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load timetable.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTimetable();
  }, [fetchTimetable]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>Timetable</Text>
      <Text style={styles.subtitle}>Lecture schedule view</Text>

      <Pressable onPress={fetchTimetable} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Text style={styles.pageSubtitle}>Subjects: {subjects.length}</Text>

      <FlatList
        data={rows}
        keyExtractor={(item, idx) => String(item?.id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.pageCard}>
            <Text style={styles.pageTitle}>{item?.subject_name || "Lecture Slot"}</Text>
            <Text style={styles.pageSubtitle}>
              {item?.day || item?.weekday || "Day"} | {item?.start_time || "--:--"} - {item?.end_time || "--:--"}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function MaterialsNativeScreen({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [matRes, subRes] = await Promise.all([
        api.get("/materials", authHeaders(token)),
        api.get("/subjects", authHeaders(token)),
      ]);
      const matRows = toArray(matRes.data);
      const subRows = toArray(subRes.data);
      setMaterials(matRows);
      setSubjects(subRows);
      if (!selectedSubjectId && subRows.length > 0) {
        setSelectedSubjectId(subRows[0].id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load materials.");
    } finally {
      setLoading(false);
    }
  }, [selectedSubjectId, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!selectedSubjectId) return materials;
    return materials.filter((row) => Number(row?.subject_id) === Number(selectedSubjectId));
  }, [materials, selectedSubjectId]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>Materials</Text>
      <Text style={styles.subtitle}>Course materials by subject</Text>

      {subjects.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipsRow}>
            {subjects.map((sub) => {
              const selected = selectedSubjectId === sub.id;
              return (
                <Pressable
                  key={String(sub.id)}
                  onPress={() => setSelectedSubjectId(sub.id)}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {sub.name || `Subject ${sub.id}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      <Pressable onPress={fetchData} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(item, idx) => String(item?.id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.pageCard}>
            <Text style={styles.pageTitle}>{item?.title || item?.name || "Material"}</Text>
            <Text style={styles.pageSubtitle}>{item?.description || item?.file_url || "No details"}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function SubmissionsNativeScreen({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tasksRes = await api.get("/tasks", authHeaders(token));
      const taskRows = toArray(tasksRes.data);
      setTasks(taskRows);

      const taskId = selectedTaskId || taskRows[0]?.id;
      if (!taskId) {
        setSubmissions([]);
      } else {
        setSelectedTaskId(taskId);
        const subRes = await api.get(`/tasks/${taskId}/submissions`, authHeaders(token));
        setSubmissions(toArray(subRes.data));
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  }, [selectedTaskId, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>Submissions</Text>
      <Text style={styles.subtitle}>Task submissions and grading overview</Text>

      {tasks.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipsRow}>
            {tasks.map((task) => {
              const selected = selectedTaskId === task.id;
              return (
                <Pressable
                  key={String(task.id)}
                  onPress={() => setSelectedTaskId(task.id)}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {task.title || `Task ${task.id}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      <Pressable onPress={fetchData} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={submissions}
        keyExtractor={(item, idx) => String(item?.id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.pageCard}>
            <Text style={styles.pageTitle}>{item?.student_name || "Student Submission"}</Text>
            <Text style={styles.pageSubtitle}>Grade: {item?.grade ?? "Not graded"}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function StaffAttendanceNativeScreen({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/staff-attendance", authHeaders(token));
      setRecords(toArray(res.data));
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load staff attendance.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const checkIn = useCallback(async () => {
    try {
      await api.post("/staff-attendance/check-in", {}, authHeaders(token));
      fetchData();
    } catch {
      // no-op
    }
  }, [fetchData, token]);

  const checkOut = useCallback(async () => {
    try {
      await api.post("/staff-attendance/check-out", {}, authHeaders(token));
      fetchData();
    } catch {
      // no-op
    }
  }, [fetchData, token]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>Staff Attendance</Text>
      <Text style={styles.subtitle}>Check-in and check-out records</Text>

      <View style={styles.rowActions}>
        <Pressable onPress={fetchData} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
        <Pressable onPress={checkIn} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Check In</Text>
        </Pressable>
        <Pressable onPress={checkOut} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Check Out</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={records}
        keyExtractor={(item, idx) => String(item?.id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.pageCard}>
            <Text style={styles.pageTitle}>{item?.employee_name || "Staff Record"}</Text>
            <Text style={styles.pageSubtitle}>{item?.date || item?.created_at || "No date"}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function MyAttendanceNativeScreen({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/attendance/my-attendance", authHeaders(token));
      setRecords(toArray(res.data));
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load my attendance.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>My Attendance</Text>
      <Text style={styles.subtitle}>Personal attendance records</Text>

      <Pressable onPress={fetchData} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={records}
        keyExtractor={(item, idx) => String(item?.id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.pageCard}>
            <Text style={styles.pageTitle}>{item?.subject_name || "Attendance"}</Text>
            <Text style={styles.pageSubtitle}>{item?.status || item?.date || "No details"}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function ScannerNativeScreen({ token, user }: { token: string; user: User }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<"error" | "success" | null>(null);
  const [assistantId, setAssistantId] = useState<number | null>(null);

  const fetchAssistantId = useCallback(async () => {
    if (user.role !== "assistant") return;
    try {
      const res = await api.get("/assistants", authHeaders(token));
      const rows = toArray(res.data);
      const own = rows.find((row) => Number(row?.user_id) === Number(user.id));
      if (own?.id) {
        setAssistantId(Number(own.id));
      }
    } catch {
      // Keep scanner usable even if assistant profile lookup fails.
    }
  }, [token, user.id, user.role]);

  useEffect(() => {
    fetchAssistantId();
  }, [fetchAssistantId]);

  const parseScannedPayload = useCallback((raw: string) => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return null;

    const parseObject = (obj: any) => {
      const studentId = Number(obj?.studentId ?? obj?.student_id);
      const subjectId = Number(obj?.subjectId ?? obj?.subject_id);
      const parsedAssistantId = Number(obj?.assistantId ?? obj?.assistant_id);
      const ts = Number(obj?.ts ?? obj?.timestamp);

      if (!studentId || !subjectId) return null;

      return {
        studentId,
        subjectId,
        assistantId: parsedAssistantId || undefined,
        ts: Number.isFinite(ts) ? ts : Date.now(),
      };
    };

    try {
      const json = JSON.parse(trimmed);
      const parsed = parseObject(json);
      if (parsed) return parsed;
    } catch {
      // Fallback to URL-style query parsing.
    }

    const queryIndex = trimmed.indexOf("?");
    if (queryIndex >= 0) {
      const query = trimmed.slice(queryIndex + 1);
      const params = new URLSearchParams(query);
      const parsed = parseObject({
        studentId: params.get("studentId") ?? params.get("student_id"),
        subjectId: params.get("subjectId") ?? params.get("subject_id"),
        assistantId: params.get("assistantId") ?? params.get("assistant_id"),
        ts: params.get("ts") ?? params.get("timestamp"),
      });
      if (parsed) return parsed;
    }

    return null;
  }, []);

  const handleBarcodeScan = useCallback(
    async ({ data }: { data: string }) => {
      if (isProcessing) return;

      setIsProcessing(true);
      setFeedback(null);
      setFeedbackType(null);

      try {
        const payload = parseScannedPayload(data);
        if (!payload) {
          throw new Error("Invalid QR format. Expected studentId and subjectId.");
        }

        if (user.role === "assistant") {
          const effectiveAssistantId = payload.assistantId || assistantId;
          if (!effectiveAssistantId) {
            throw new Error("Assistant profile was not resolved for scanning.");
          }

          const res = await api.post(
            "/assistants/scan",
            {
              studentId: payload.studentId,
              subjectId: payload.subjectId,
              assistantId: effectiveAssistantId,
              ts: payload.ts,
            },
            authHeaders(token),
          );

          setFeedback(res?.data?.message || "Attendance recorded successfully.");
          setFeedbackType("success");
        } else if (user.role === "doctor") {
          const res = await api.post(
            "/attendance/scan",
            {
              studentId: payload.studentId,
              subjectId: payload.subjectId,
              ts: payload.ts,
            },
            authHeaders(token),
          );

          setFeedback(res?.data?.message || "Attendance recorded successfully.");
          setFeedbackType("success");
        } else {
          throw new Error("Scanner is available for doctor and assistant roles only.");
        }
      } catch (err: any) {
        setFeedback(err?.response?.data?.error || err?.message || "Failed to process scan.");
        setFeedbackType("error");
      } finally {
        setTimeout(() => setIsProcessing(false), 1200);
      }
    },
    [assistantId, isProcessing, parseScannedPayload, token, user.role],
  );

  if (!permission) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={BRAND.primary} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.screenTitle}>Scanner</Text>
        <Text style={styles.subtitle}>Camera permission is required to scan QR codes.</Text>
        <Pressable onPress={requestPermission} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>Grant Camera Access</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>QR Scanner</Text>
      <Text style={styles.subtitle}>Scan student QR to record attendance</Text>

      <View style={styles.scannerCard}>
        <CameraView
          style={styles.cameraView}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleBarcodeScan}
        />
      </View>

      {feedback ? (
        <View style={[styles.scanFeedback, feedbackType === "error" ? styles.scanFeedbackError : styles.scanFeedbackSuccess]}>
          <Text style={styles.scanFeedbackText}>{feedback}</Text>
        </View>
      ) : null}

      <Text style={styles.pageSubtitle}>
        Status: {isProcessing ? "Processing scan..." : "Ready"}
      </Text>
    </SafeAreaView>
  );
}

function WorkspacesNativeScreen({ token, navigation }: { token: string; navigation: any }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/workspaces/rooms", authHeaders(token));
      setRooms(toArray(res.data));
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load workspaces.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>Workspaces</Text>
      <Text style={styles.subtitle}>Rooms list</Text>

      <Pressable onPress={fetchData} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={rooms}
        keyExtractor={(item, idx) => String(item?.id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={styles.pageCard}
            onPress={() =>
              navigation.navigate("WorkspaceRoomNative", {
                roomId: Number(item?.id),
                roomName: item?.name,
              })
            }
          >
            <Text style={styles.pageTitle}>{item?.name || "Workspace Room"}</Text>
            <Text style={styles.pageSubtitle}>{item?.type || "room"}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function WorkspaceRoomNativeScreen({
  token,
  user,
  route,
}: {
  token: string;
  user: User;
  route: RouteProp<RootStackParamList, "WorkspaceRoomNative">;
}) {
  const { roomId } = route.params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState("");
  const [typingUserId, setTypingUserId] = useState<number | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [selectedAttachment, setSelectedAttachment] = useState<{
    uri: string;
    name: string;
    mimeType: string;
    category: "image" | "file";
  } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const socketRef = useRef<any>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<QueuedMessage[]>([]);
  const inFlightQueueIdsRef = useRef<Set<string>>(new Set());
  const isFlushingQueueRef = useRef(false);

  const setQueueInMemory = useCallback((next: QueuedMessage[]) => {
    queueRef.current = next;
    setQueuedCount(next.length);
  }, []);

  const enqueueMessage = useCallback(
    async (item: QueuedMessage) => {
      const existing = queueRef.current.findIndex((row) => row.queue_id === item.queue_id);
      const next = [...queueRef.current];

      if (existing >= 0) {
        next[existing] = item;
      } else {
        next.push(item);
      }

      setQueueInMemory(next);
      await upsertQueueItem(roomId, item);
    },
    [roomId, setQueueInMemory],
  );

  const removeQueuedById = useCallback(
    async (queueId: string) => {
      inFlightQueueIdsRef.current.delete(queueId);
      const next = queueRef.current.filter((row) => row.queue_id !== queueId);
      setQueueInMemory(next);
      await removeQueueItem(roomId, queueId);
    },
    [roomId, setQueueInMemory],
  );

  const flushQueue = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    if (isFlushingQueueRef.current) return;

    isFlushingQueueRef.current = true;

    try {
      for (const queueItem of queueRef.current) {
        if (inFlightQueueIdsRef.current.has(queueItem.queue_id)) continue;
        inFlightQueueIdsRef.current.add(queueItem.queue_id);

        let item = queueItem;

        if (item.attachment && !item.attachment.file_url) {
          try {
            const form = new FormData();
            form.append("file", {
              uri: item.attachment.uri,
              name: item.attachment.name,
              type: item.attachment.mimeType,
            } as any);

            const uploadRes = await api.post(
              `/workspaces/rooms/${roomId}/messages/upload`,
              form,
              {
                ...authHeaders(token),
                headers: {
                  ...authHeaders(token).headers,
                  "Content-Type": "multipart/form-data",
                },
              },
            );

            item = {
              ...item,
              attachment: {
                ...item.attachment,
                file_url: uploadRes.data?.file_url,
              },
            };

            await enqueueMessage(item);
          } catch {
            inFlightQueueIdsRef.current.delete(item.queue_id);
            continue;
          }
        }

        socket.emit("send_message", {
          room_id: item.room_id,
          content: item.content,
          type: item.type,
          ...(item.attachment?.file_url ? { file_url: item.attachment.file_url } : {}),
          reply_to_message_id: item.reply_to_message_id,
          client_temp_id: item.queue_id,
        });

        setTimeout(() => {
          inFlightQueueIdsRef.current.delete(item.queue_id);
        }, 6000);
      }
    } finally {
      isFlushingQueueRef.current = false;
    }
  }, [enqueueMessage, roomId, token]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roomRes, membersRes, messagesRes] = await Promise.all([
        api.get(`/workspaces/rooms/${roomId}`, authHeaders(token)),
        api.get(`/workspaces/rooms/${roomId}/members`, authHeaders(token)),
        api.get(`/workspaces/rooms/${roomId}/messages`, authHeaders(token)),
      ]);
      setRoom(roomRes.data);
      setMembers(toArray(membersRes.data));
      setMessages(toArray(messagesRes.data?.data || messagesRes.data));

      try {
        await api.put(`/workspaces/rooms/${roomId}/seen`, {}, authHeaders(token));
      } catch {
        // Seen state should not block room rendering.
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load room details.");
    } finally {
      setLoading(false);
    }
  }, [roomId, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let mounted = true;

    const hydrateQueue = async () => {
      const storedQueue = await loadRoomQueue(roomId);
      if (!mounted) return;

      setQueueInMemory(storedQueue);

      if (storedQueue.length > 0) {
        setMessages((prev) => {
          const existingTempIds = new Set(
            prev.map((msg) => msg?.client_temp_id).filter(Boolean),
          );

          const pending = storedQueue
            .filter((item) => !existingTempIds.has(item.queue_id))
            .map((item) => ({
              id: item.queue_id,
              room_id: item.room_id,
              sender_id: user.id,
              sender_name: user.name,
              content: item.content,
              type: item.type,
              file_url: item.attachment?.file_url || item.attachment?.uri || null,
              created_at: item.created_at,
              client_temp_id: item.queue_id,
              local_status: "pending",
            }));

          return pending.length > 0 ? [...prev, ...pending] : prev;
        });
      }
    };

    hydrateQueue();

    return () => {
      mounted = false;
    };
  }, [roomId, setQueueInMemory, user.id, user.name]);

  useEffect(() => {
    const socket = getRealtimeSocket(token);
    socketRef.current = socket;

    const handleConnect = () => {
      socket.emit("join_room", { roomId });
      api.put(`/workspaces/rooms/${roomId}/seen`, {}, authHeaders(token)).catch(() => {});
      flushQueue();
    };

    const handleReconnect = () => {
      socket.emit("join_room", { roomId });
    };

    const handleReceiveMessage = (incoming: any) => {
      if (Number(incoming?.room_id) !== Number(roomId)) return;

      setMessages((prev) => {
        if (incoming?.client_temp_id) {
          removeQueuedById(incoming.client_temp_id).catch(() => {});
          const idx = prev.findIndex(
            (item) => item?.client_temp_id === incoming.client_temp_id,
          );
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = incoming;
            return next;
          }
        }

        if (prev.some((item) => Number(item?.id) === Number(incoming?.id))) {
          return prev;
        }

        return [...prev, incoming];
      });
    };

    const handleTyping = (payload: any) => {
      if (Number(payload?.room_id) !== Number(roomId)) return;
      if (Number(payload?.user_id) === Number(user.id)) return;
      setTypingUserId(payload?.is_typing ? Number(payload.user_id) : null);
    };

    const handleReactionUpdated = (payload: any) => {
      const messageId = Number(payload?.message_id);
      if (!messageId) return;

      setMessages((prev) =>
        prev.map((msg) => {
          if (Number(msg?.id) !== messageId) return msg;

          const current = Array.isArray(msg?.reactions) ? msg.reactions : [];
          const exists = current.find(
            (r: any) =>
              Number(r?.user_id) === Number(payload?.user_id) &&
              String(r?.reaction) === String(payload?.reaction),
          );

          let next = current;
          if (payload?.action === "added" && !exists) {
            next = [
              ...current,
              {
                user_id: Number(payload?.user_id),
                reaction: String(payload?.reaction),
              },
            ];
          }

          if (payload?.action === "removed") {
            next = current.filter(
              (r: any) =>
                !(
                  Number(r?.user_id) === Number(payload?.user_id) &&
                  String(r?.reaction) === String(payload?.reaction)
                ),
            );
          }

          return { ...msg, reactions: next };
        }),
      );
    };

    const handleMessageUpdated = (updated: any) => {
      if (Number(updated?.room_id) !== Number(roomId)) return;
      setMessages((prev) =>
        prev.map((msg) => (Number(msg?.id) === Number(updated?.id) ? updated : msg)),
      );
    };

    const handleSocketError = (payload: any) => {
      if (payload?.message) {
        setError(String(payload.message));
      }
    };

    socket.on("connect", handleConnect);
    socket.on("reconnect", handleReconnect);
    socket.on("receive_message", handleReceiveMessage);
    socket.on("typing", handleTyping);
    socket.on("reaction_updated", handleReactionUpdated);
    socket.on("message_updated", handleMessageUpdated);
    socket.on("socket_error", handleSocketError);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.emit("leave_room", { roomId });
      socket.off("connect", handleConnect);
      socket.off("reconnect", handleReconnect);
      socket.off("receive_message", handleReceiveMessage);
      socket.off("typing", handleTyping);
      socket.off("reaction_updated", handleReactionUpdated);
      socket.off("message_updated", handleMessageUpdated);
      socket.off("socket_error", handleSocketError);
    };
  }, [flushQueue, removeQueuedById, roomId, token, user.id]);

  const pickAttachment = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: "*/*",
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      const mimeType = file.mimeType || "application/octet-stream";
      const category: "image" | "file" = mimeType.startsWith("image/")
        ? "image"
        : "file";

      setSelectedAttachment({
        uri: file.uri,
        name: file.name || `file-${Date.now()}`,
        mimeType,
        category,
      });
    } catch {
      setError("Failed to pick attachment.");
    }
  }, []);

  const sendMessage = useCallback(async () => {
    const content = messageText.trim();
    if ((!content && !selectedAttachment) || isSending) return;

    setIsSending(true);
    setError(null);

    try {
      const type: "text" | "image" | "file" = selectedAttachment
        ? selectedAttachment.category
        : "text";

      const clientTempId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const queueItem: QueuedMessage = {
        queue_id: clientTempId,
        room_id: roomId,
        content,
        type,
        reply_to_message_id: null,
        created_at: new Date().toISOString(),
        ...(selectedAttachment
          ? {
              attachment: {
                uri: selectedAttachment.uri,
                name: selectedAttachment.name,
                mimeType: selectedAttachment.mimeType,
                category: selectedAttachment.category,
              },
            }
          : {}),
      };

      const optimistic = {
        id: clientTempId,
        room_id: roomId,
        sender_id: user.id,
        sender_name: user.name,
        content,
        type,
        file_url: selectedAttachment?.uri || null,
        created_at: queueItem.created_at,
        client_temp_id: clientTempId,
        local_status: "pending",
      };

      setMessages((prev) => [...prev, optimistic]);

      await enqueueMessage(queueItem);
      await flushQueue();

      setMessageText("");
      setTypingUserId(null);
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit("typing", { roomId, isTyping: false });
      }
      setSelectedAttachment(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to send message.");
    } finally {
      setIsSending(false);
    }
  }, [enqueueMessage, flushQueue, isSending, messageText, roomId, selectedAttachment, user.id, user.name]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleTextChange = useCallback(
    (value: string) => {
      setMessageText(value);
      const socket = socketRef.current;
      if (!socket?.connected) return;

      const isTyping = value.trim().length > 0;
      socket.emit("typing", { roomId, isTyping });

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          socket.emit("typing", { roomId, isTyping: false });
        }, 1200);
      }
    },
    [roomId],
  );

  const reactToMessage = useCallback((messageId: number, reaction: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("Realtime socket is not connected.");
      return;
    }
    socket.emit("toggle_reaction", { messageId, reaction });
  }, []);

  const startEditing = useCallback((item: any) => {
    const id = Number(item?.id);
    if (!id) return;
    setEditingMessageId(id);
    setEditingText(String(item?.content || ""));
  }, []);

  const saveEditing = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected || !editingMessageId) {
      setError("Realtime socket is not connected.");
      return;
    }
    socket.emit("edit_message", {
      messageId: editingMessageId,
      content: editingText,
    });
    setEditingMessageId(null);
    setEditingText("");
  }, [editingMessageId, editingText]);

  const removeMessage = useCallback((messageId: number) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("Realtime socket is not connected.");
      return;
    }
    socket.emit("delete_message", { messageId });
  }, []);

  const typingName = useMemo(() => {
    if (!typingUserId) return null;
    return members.find((m) => Number(m?.user_id) === Number(typingUserId))?.name || "Someone";
  }, [members, typingUserId]);

  const renderReactionSummary = useCallback((reactions: any[]) => {
    if (!Array.isArray(reactions) || reactions.length === 0) return "";
    const counts = reactions.reduce((acc: Record<string, number>, row: any) => {
      const key = String(row?.reaction || "");
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([key, count]) => `${key} ${count}`)
      .join("  ");
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>{room?.name || "Workspace Room"}</Text>
      <Text style={styles.subtitle}>Members: {members.length} | Messages: {messages.length}</Text>
      {queuedCount > 0 ? (
        <Text style={styles.queueBadgeText}>Queued offline: {queuedCount}</Text>
      ) : null}
      {typingName ? (
        <Text style={styles.typingIndicatorText}>{typingName} is typing...</Text>
      ) : null}

      <Pressable onPress={fetchData} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={BRAND.primary} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={messages}
        keyExtractor={(item, idx) => String(item?.id || idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.pageCard}>
            <Text style={styles.pageTitle}>{item?.sender_name || "User"}</Text>
            {editingMessageId === Number(item?.id) ? (
              <View style={styles.editRow}>
                <TextInput
                  value={editingText}
                  onChangeText={setEditingText}
                  style={styles.editInput}
                  multiline
                />
                <View style={styles.rowActions}>
                  <Pressable onPress={saveEditing} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Save</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setEditingMessageId(null);
                      setEditingText("");
                    }}
                    style={styles.secondaryBtn}
                  >
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Text style={styles.pageSubtitle}>{item?.content || "(empty message)"}</Text>
            )}
            {item?.file_url ? (
              <View style={styles.attachmentWrap}>
                {(item?.type === "image" || String(item?.file_url).match(/\.(png|jpe?g|gif|webp)$/i)) ? (
                  <Image
                    source={{ uri: resolveUploadUrl(item.file_url) }}
                    style={styles.attachmentImagePreview}
                    resizeMode="cover"
                  />
                ) : null}
                <Pressable
                  onPress={() => {
                    const url = resolveUploadUrl(item.file_url);
                    if (url) Linking.openURL(url).catch(() => {});
                  }}
                >
                  <Text style={styles.pagePath}>Open attachment</Text>
                </Pressable>
              </View>
            ) : null}

            {!!renderReactionSummary(item?.reactions || []) ? (
              <Text style={styles.reactionSummaryText}>
                {renderReactionSummary(item?.reactions || [])}
              </Text>
            ) : null}

            {Number(item?.id) ? (
              <View style={styles.messageActionRow}>
                <Pressable onPress={() => reactToMessage(Number(item.id), "👍")}>
                  <Text style={styles.messageActionText}>👍</Text>
                </Pressable>
                <Pressable onPress={() => reactToMessage(Number(item.id), "❤️")}>
                  <Text style={styles.messageActionText}>❤️</Text>
                </Pressable>
                {Number(item?.sender_id) === Number(user.id) ? (
                  <Pressable onPress={() => startEditing(item)}>
                    <Text style={styles.messageActionText}>Edit</Text>
                  </Pressable>
                ) : null}
                {Number(item?.sender_id) === Number(user.id) ? (
                  <Pressable onPress={() => removeMessage(Number(item.id))}>
                    <Text style={[styles.messageActionText, styles.messageActionDanger]}>Delete</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      />

      {selectedAttachment ? (
        <View style={styles.attachmentPreviewRow}>
          <Text style={styles.pageSubtitle} numberOfLines={1}>
            Attachment: {selectedAttachment.name}
          </Text>
          <Pressable onPress={() => setSelectedAttachment(null)}>
            <Text style={styles.attachmentRemoveText}>Remove</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.messageComposerRow}>
        <Pressable onPress={pickAttachment} style={styles.attachmentButton}>
          <Ionicons name="attach" size={18} color="#0F172A" />
        </Pressable>
        <TextInput
          value={messageText}
          onChangeText={handleTextChange}
          placeholder="Type a message"
          style={styles.messageInput}
          editable={!isSending}
          onBlur={() => {
            const socket = socketRef.current;
            if (socket?.connected) {
              socket.emit("typing", { roomId, isTyping: false });
            }
          }}
        />
        <Pressable
          onPress={sendMessage}
          style={[styles.secondaryBtn, isSending && styles.primaryButtonDisabled]}
          disabled={isSending}
        >
          <Text style={styles.secondaryBtnText}>{isSending ? "Sending" : "Send"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function PagesScreen({
  user,
  navigation,
}: {
  user: User;
  navigation: any;
}) {
  const pages = useMemo(() => getPagesForRole(user.role), [user.role]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>All Pages</Text>
      <FlatList
        data={pages}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={styles.pageCard}
            onPress={() => {
              const target = nativeRouteByKey[item.key];
              if (target) {
                navigation.navigate(target);
              } else {
                navigation.navigate("PageDetails", { page: item });
              }
            }}
          >
            <Text style={styles.pageTitle}>{item.title}</Text>
            <Text style={styles.pageSubtitle}>{item.subtitle}</Text>
            <Text style={styles.pagePath}>{item.path}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function PageDetailsScreen({
  route,
}: {
  route: RouteProp<RootStackParamList, "PageDetails">;
}) {
  const { page } = route.params;

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.screenTitle}>{page.title}</Text>
      <Text style={styles.subtitle}>{page.subtitle}</Text>
      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Next Step</Text>
        <Text style={styles.noticeText}>
          This native page shell is ready. I can now build this page with the same
          business logic as your website API endpoints.
        </Text>
        <Text style={styles.pathChip}>{page.path}</Text>
      </View>
    </SafeAreaView>
  );
}



function MainTabs({
  user,
  token,
  onLogout,
}: {
  user: User;
  token: string;
  onLogout: () => Promise<void>;
}) {
  return (
    <MainTabsNavigator
      primaryColor={BRAND.primary}
      token={token}
      userRole={user.role}
      renderHome={() => <DashboardNativeScreen token={token} user={user} />}
      renderQr={() => <QrNativeScreen token={token} user={user} />}
      renderMaterials={() => <MaterialsScreenNative token={token} />}
      renderTasks={() => <TasksScreenNative token={token} user={user} />}
      renderWorkspaces={(props: any) => <WorkspaceNativeScreen {...props} token={token} user={user} />}
      renderAccount={() => <AccountNativeScreen user={user} onLogout={onLogout} />}
    />
  );
}

function WorkspaceCallScreenGuard({
  token,
  user,
  navigation,
  route,
}: {
  token: string;
  user: User;
  navigation: any;
  route: any;
}) {
  const isExpoGo = Constants.appOwnership === "expo";

  if (isExpoGo) {
    return (
      <SafeAreaView style={styles.unsupportedWrap}>
        <Text style={styles.unsupportedTitle}>Calls Need Dev Build</Text>
        <Text style={styles.unsupportedSubtitle}>
          WebRTC calls are not supported in Expo Go. Use a development build for calling.
        </Text>
        <Pressable style={styles.unsupportedBackBtn} onPress={() => navigation?.goBack?.()}>
          <Text style={styles.unsupportedBackBtnText}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const WorkspaceRtcCallNativeScreen = require("./src/screens/WorkspaceRtcCallNativeScreen").default;
  return <WorkspaceRtcCallNativeScreen token={token} user={user} navigation={navigation} route={route} />;
}

export default function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [liveNotification, setLiveNotification] = useState<{
    id: number;
    title: string;
    message: string;
  } | null>(null);
  const latestNotificationIdRef = useRef<number | null>(null);
  const liveNotificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushTokenRef = useRef<string | null>(null);

  const showLiveBanner = useCallback((title: string, message: string) => {
    setLiveNotification({
      id: Date.now(),
      title: String(title || "إشعار جديد"),
      message: String(message || "لديك تحديث جديد"),
    });

    if (liveNotificationTimerRef.current) {
      clearTimeout(liveNotificationTimerRef.current);
    }

    liveNotificationTimerRef.current = setTimeout(() => {
      setLiveNotification(null);
    }, 5000);
  }, []);

  const navigateFromPushData = useCallback((rawData: any) => {
    if (!navigationRef.isReady()) return;

    const data = rawData && typeof rawData === "object" ? rawData : {};
    const roomId = Number(data.room_id || 0);

    if (roomId > 0) {
      navigationRef.navigate("WorkspaceRoomNative", {
        roomId,
        roomName: data.room_name ? String(data.room_name) : undefined,
      });
      return;
    }

    const pushType = String(data.type || "").toLowerCase();
    if (pushType === "task" || pushType === "submission") {
      navigationRef.navigate("TasksNative");
      return;
    }

    navigationRef.navigate("NotificationsNative");
  }, []);

  const registerPushToken = useCallback(async (authToken: string) => {
    try {
      const existingPermission = await Notifications.getPermissionsAsync();
      let status = existingPermission.status;

      if (status !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }

      if (status !== "granted") return;

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        Constants.easConfig?.projectId;

      if (!projectId) return;

      const expoToken = (
        await Notifications.getExpoPushTokenAsync({ projectId })
      )?.data;

      if (!expoToken) return;
      if (pushTokenRef.current === expoToken) return;

      await registerDeviceToken(authToken, {
        token: expoToken,
        platform:
          Platform.OS === "ios"
            ? "ios"
            : Platform.OS === "android"
              ? "android"
              : "unknown",
      });

      pushTokenRef.current = expoToken;
    } catch {
      // Keep app flow working even if push registration fails.
    }
  }, []);

  const restoreSession = useCallback(async () => {
    try {
      const savedToken = await getToken();

      if (!savedToken) {
        setIsBooting(false);
        return;
      }

      const me = await getMe(savedToken);
      setToken(savedToken);
      setUser(me);
    } catch {
      await clearToken();
      setToken(null);
      setUser(null);
    } finally {
      setIsBooting(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!token || !user) return;

    registerPushToken(token);

    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification: Notifications.Notification) => {
        const title = String(notification.request.content.title || "إشعار جديد");
        const message = String(notification.request.content.body || "لديك تحديث جديد");
        showLiveBanner(title, message);
      },
    );

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
        const data = response?.notification?.request?.content?.data;
        navigateFromPushData(data);
      });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [navigateFromPushData, registerPushToken, showLiveBanner, token, user]);

  useEffect(() => {
    if (!token || !user) return;

    const parseMeta = (raw: any) => {
      if (!raw) return {};
      if (typeof raw === "object") return raw;
      try {
        return JSON.parse(String(raw));
      } catch {
        return {};
      }
    };

    const isTaskOrMessageNotification = (item: any) => {
      const meta = parseMeta(item?.meta);
      const type = String(meta?.type || "").toLowerCase();
      const nType = String(item?.notification_type || "").toLowerCase();
      if (nType === "task") return true;
      return ["message", "mention", "task", "submission"].includes(type);
    };

    const refreshNotifications = async () => {
      try {
        const res = await api.get("/notifications", authHeaders(token));
        const rows = toArray(res.data);
        if (!rows.length) return;

        const newestId = Number(rows[0]?.id || 0);
        if (!newestId) return;

        if (latestNotificationIdRef.current === null) {
          latestNotificationIdRef.current = newestId;
          return;
        }

        if (newestId <= latestNotificationIdRef.current) return;

        const incoming = rows
          .filter((row: any) => Number(row?.id || 0) > Number(latestNotificationIdRef.current || 0))
          .filter((row: any) => !row?.is_read)
          .filter(isTaskOrMessageNotification)
          .sort((a: any, b: any) => Number(a?.id || 0) - Number(b?.id || 0));

        latestNotificationIdRef.current = newestId;
        if (!incoming.length) return;

        const latest = incoming[incoming.length - 1];
        setLiveNotification({
          id: Number(latest.id),
          title: String(latest.title || "إشعار جديد"),
          message: String(latest.message || "لديك تحديث جديد"),
        });

        if (liveNotificationTimerRef.current) {
          clearTimeout(liveNotificationTimerRef.current);
        }
        liveNotificationTimerRef.current = setTimeout(() => {
          setLiveNotification(null);
        }, 5000);
      } catch {
        // Ignore transient notification errors.
      }
    };

    refreshNotifications();
    const interval = setInterval(refreshNotifications, 8000);

    return () => {
      clearInterval(interval);
      if (liveNotificationTimerRef.current) {
        clearTimeout(liveNotificationTimerRef.current);
        liveNotificationTimerRef.current = null;
      }
    };
  }, [token, user]);

  const handleLogin = useCallback(async (username: string, password: string) => {
    setIsAuthLoading(true);
    try {
      const result = await login(username, password);
      await saveToken(result.token);
      setToken(result.token);
      
      // Fetch full user data with logos
      try {
        const fullUserData = await getMe(result.token);
        setUser(fullUserData);
      } catch (err) {
        // Fallback to login response if /me fails
        console.warn("Failed to fetch full user data, using login response:", err);
        setUser(result.user);
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error || "Login failed. Please try again.";
      throw new Error(message);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    if (token && pushTokenRef.current) {
      await unregisterDeviceToken(token, pushTokenRef.current).catch(() => {});
      pushTokenRef.current = null;
    }

    disconnectRealtimeSocket();
    await clearToken();
    setToken(null);
    setUser(null);
  }, [token]);

  if (isBooting) {
    return <BootLoadingScreen />;
  }

  if (!token || !user) {
    return <LoginNativeScreen onLogin={handleLogin} loading={isAuthLoading} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
      <NavigationContainer ref={navigationRef}>
        <RootStack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: BRAND.surface },
          headerTintColor: BRAND.primary,
          headerTitleStyle: { fontWeight: "700" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: BRAND.background },
        }}
      >
        <RootStack.Screen
          name="Main"
          options={{ headerShown: false }}
        >
          {() => <MainTabs user={user} token={token} onLogout={handleLogout} />}
        </RootStack.Screen>
        <RootStack.Screen
          name="PageDetails"
          component={PageDetailsScreen}
          options={({ route }) => ({
            title: route.params.page.title,
            headerBackTitle: "Back",
          })}
        />
        <RootStack.Screen name="ScannerNative" options={{ title: "QR Scanner" }}>
          {() => <ScannerNativeScreen token={token} user={user} />}
        </RootStack.Screen>
        <RootStack.Screen name="QrNative" options={{ title: "QR" }}>
          {(props) => <QrNativeScreen {...props} token={token} user={user} />}
        </RootStack.Screen>
        <RootStack.Screen name="DashboardNative" options={{ title: "Dashboard" }}>
          {() => <DashboardNativeScreen token={token} user={user} />}
        </RootStack.Screen>
        <RootStack.Screen name="AttendanceNative" options={{ title: "Attendance" }}>
          {() => <AttendanceNativeScreen token={token} user={user} />}
        </RootStack.Screen>
        <RootStack.Screen name="LecturesNative" options={{ title: "Lectures" }}>
          {() => <LecturesNativeScreen token={token} />}
        </RootStack.Screen>
        <RootStack.Screen name="StudentsNative" options={{ title: "Students" }}>
          {() => <StudentsNativeScreen token={token} />}
        </RootStack.Screen>
        <RootStack.Screen name="SubjectsNative" options={{ headerShown: false }}>
          {() => <SubjectsNativeScreen token={token} />}
        </RootStack.Screen>
        <RootStack.Screen name="TasksNative" options={{ title: "Tasks" }}>
          {() => <TasksScreenNative token={token} user={user} />}
        </RootStack.Screen>
        <RootStack.Screen name="NotificationsNative" options={{ title: "Notifications" }}>
          {() => <NotificationsNativeScreen token={token} />}
        </RootStack.Screen>
        <RootStack.Screen name="TimetableNative" options={{ title: "Timetable" }}>
          {() => <TimetableNativeScreen token={token} />}
        </RootStack.Screen>
        <RootStack.Screen name="MaterialsNative" options={{ title: "Materials" }}>
          {() => <MaterialsScreenNative token={token} />}
        </RootStack.Screen>
        <RootStack.Screen name="SubjectMaterialsNative" options={{ headerShown: false }}>
          {(props) => <SubjectMaterialsNativeScreen {...props} token={token} user={user} />}
        </RootStack.Screen>
        <RootStack.Screen
          name="MaterialViewerNative"
          options={{ headerShown: false }}
        >
          {(props) => <MaterialViewerNativeScreen {...props} token={token} user={user} />}
        </RootStack.Screen>
        <RootStack.Screen name="SubmissionsNative" options={{ title: "Submissions" }}>
          {() => <SubmissionsNativeScreen token={token} />}
        </RootStack.Screen>
        <RootStack.Screen name="StaffAttendanceNative" options={{ title: "Staff Attendance" }}>
          {() => <StaffAttendanceNativeScreen token={token} />}
        </RootStack.Screen>
        <RootStack.Screen name="MyAttendanceNative" options={{ title: "My Attendance" }}>
          {() => <MyAttendanceNativeScreen token={token} />}
        </RootStack.Screen>
        <RootStack.Screen name="WorkspacesNative" options={{ title: "Workspaces" }}>
          {(props) => <WorkspacesNativeScreen {...props} token={token} />}
        </RootStack.Screen>
        <RootStack.Screen
          name="WorkspaceRoomNative"
          options={({ route }) => ({
            title: route.params.roomName || `Room ${route.params.roomId}`,
            headerShown: false,
          })}
        >
          {(props) => <WorkspaceRoomChatNativeScreen {...props} token={token} user={user} />}
        </RootStack.Screen>
        <RootStack.Screen
          name="WorkspaceRoomProfileNative"
          options={{ headerShown: false }}
        >
          {(props) => <WorkspaceRoomProfileNativeScreen {...props} token={token} user={user} />}
        </RootStack.Screen>
        <RootStack.Screen
          name="WorkspaceCallNative"
          options={{ headerShown: false }}
        >
          {(props) => <WorkspaceCallScreenGuard {...props} token={token} user={user} />}
        </RootStack.Screen>
        </RootStack.Navigator>
      </NavigationContainer>

      {liveNotification ? (
        <Pressable
          style={styles.liveNotificationBanner}
          onPress={() => {
            setLiveNotification(null);
            if (navigationRef.isReady()) {
              navigationRef.navigate("NotificationsNative");
            }
          }}
        >
          <Text numberOfLines={1} style={styles.liveNotificationTitle}>
            {liveNotification.title}
          </Text>
          <Text numberOfLines={2} style={styles.liveNotificationMessage}>
            {liveNotification.message}
          </Text>
        </Pressable>
      ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  unsupportedWrap: {
    flex: 1,
    backgroundColor: BRAND.background,
    paddingHorizontal: SCREEN_SIDE_PADDING,
    alignItems: "center",
    justifyContent: "center",
  },
  unsupportedTitle: {
    color: BRAND.primaryDark,
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
  },
  unsupportedSubtitle: {
    color: BRAND.textMuted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 24,
  },
  unsupportedBackBtn: {
    minWidth: 150,
    height: 46,
    borderRadius: 12,
    backgroundColor: BRAND.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  unsupportedBackBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  liveNotificationBanner: {
    position: "absolute",
    top: Platform.OS === "ios" ? 58 : 24,
    left: 12,
    right: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1f2a44",
    zIndex: 999,
  },
  liveNotificationTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  liveNotificationMessage: {
    color: "#d5deee",
    fontSize: 12,
    lineHeight: 16,
  },
  refreshBtn: {
    alignSelf: "flex-start",
    backgroundColor: BRAND.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  refreshBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  secondaryBtn: {
    backgroundColor: BRAND.secondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  secondaryBtnText: {
    color: BRAND.primaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  errorText: {
    color: BRAND.danger,
    fontSize: 13,
    marginBottom: 8,
  },
  unreadCard: {
    borderColor: BRAND.primary,
    backgroundColor: "#EEF4FC",
  },
  statCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 14,
  },
  statKey: {
    color: BRAND.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: BRAND.primary,
    fontSize: 18,
    fontWeight: "800",
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    backgroundColor: BRAND.primaryDimmed,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: BRAND.primary,
  },
  chipText: {
    color: BRAND.primaryDark,
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  searchInput: {
    backgroundColor: BRAND.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  scannerCard: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BRAND.border,
    marginBottom: 12,
  },
  cameraView: {
    width: "100%",
    height: 300,
  },
  scanFeedback: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  scanFeedbackSuccess: {
    backgroundColor: "#E8F9EF",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  scanFeedbackError: {
    backgroundColor: "#FEECEC",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  scanFeedbackText: {
    color: BRAND.text,
    fontSize: 13,
    fontWeight: "600",
  },
  typingIndicatorText: {
    fontSize: 12,
    color: BRAND.primary,
    marginBottom: 8,
    fontWeight: "600",
  },
  queueBadgeText: {
    fontSize: 12,
    color: "#B45309",
    marginBottom: 6,
    fontWeight: "700",
  },
  attachmentWrap: {
    marginTop: 8,
    gap: 6,
  },
  attachmentImagePreview: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: BRAND.primaryDimmed,
  },
  messageActionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    alignItems: "center",
  },
  messageActionText: {
    color: BRAND.primaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  messageActionDanger: {
    color: BRAND.danger,
  },
  reactionSummaryText: {
    color: BRAND.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  editRow: {
    marginTop: 4,
    gap: 8,
  },
  editInput: {
    backgroundColor: BRAND.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 42,
    color: BRAND.text,
  },
  messageComposerRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingTop: 8,
  },
  attachmentButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: BRAND.primaryDimmed,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F2F6FB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
  },
  attachmentRemoveText: {
    color: BRAND.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  messageInput: {
    flex: 1,
    backgroundColor: BRAND.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  screen: {
    flex: 1,
    backgroundColor: BRAND.background,
    paddingHorizontal: SCREEN_SIDE_PADDING,
    paddingTop: 16,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: BRAND.primary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: BRAND.textMuted,
    marginBottom: 16,
  },
  listContent: {
    gap: 10,
    paddingBottom: 20,
  },
  pageCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 14,
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: BRAND.primaryDark,
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: BRAND.textMuted,
  },
  pagePath: {
    marginTop: 6,
    fontSize: 11,
    color: BRAND.primary,
    fontWeight: "600",
  },
  noticeCard: {
    marginTop: 8,
    backgroundColor: BRAND.primaryDimmed,
    borderColor: BRAND.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  noticeTitle: {
    color: BRAND.primary,
    fontWeight: "700",
    marginBottom: 6,
  },
  noticeText: {
    color: BRAND.primaryDark,
    fontSize: 13,
    lineHeight: 20,
  },
  pathChip: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: BRAND.secondary,
    color: BRAND.primaryDark,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "700",
  },

  dashboardScrollContent: {
    paddingBottom: 22,
    gap: 12,
  },
  dashboardHeroCard: {
    backgroundColor: BRAND.primary,
    borderRadius: 18,
    padding: 16,
    overflow: "hidden",
  },
  dashboardHeroBlobTop: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    top: -48,
    right: -42,
  },
  dashboardHeroBlobBottom: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    bottom: -26,
    left: -24,
  },
  dashboardHeroLabel: {
    color: "#E5EEFB",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  dashboardHeroTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  dashboardHeroSubtitle: {
    color: BRAND.secondary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 14,
  },
  dashboardHeroStatsRow: {
    flexDirection: "row",
    gap: 10,
  },
  dashboardHeroMiniCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  dashboardHeroMiniLabel: {
    color: "#DDEAFF",
    fontSize: 11,
    marginBottom: 2,
  },
  dashboardHeroMiniValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  dashboardActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dashboardBadge: {
    backgroundColor: BRAND.secondary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  dashboardBadgeText: {
    color: BRAND.primaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  dashboardMetaText: {
    color: BRAND.textMuted,
    fontSize: 12,
  },
  dashboardTopCardsRow: {
    gap: 10,
  },
  dashboardTopCard: {
    width: 150,
    backgroundColor: BRAND.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 12,
  },
  dashboardTopCardLabel: {
    color: BRAND.textMuted,
    fontSize: 12,
    marginBottom: 8,
  },
  dashboardTopCardValue: {
    color: BRAND.primary,
    fontSize: 24,
    fontWeight: "800",
  },
  dashboardSectionCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 14,
    gap: 8,
  },
  dashboardSectionTitle: {
    color: BRAND.primaryDark,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 2,
  },
  dashboardDetailRow: {
    borderRadius: 10,
    backgroundColor: "#F2F6FB",
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dashboardDetailKey: {
    flex: 1,
    color: BRAND.primaryDark,
    fontSize: 13,
    fontWeight: "600",
    paddingRight: 10,
  },
  dashboardDetailValue: {
    color: BRAND.primary,
    fontSize: 16,
    fontWeight: "800",
  },
});
