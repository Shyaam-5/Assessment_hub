import io from 'socket.io-client';

class SocketService {
    constructor() {
        this.socket = null;
        this.isConnected = false;
    }

    connect() {
        if (this.socket) return this.socket;

        const socketURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

        this.socket = io(socketURL, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log('🔌 Connected to WebSocket');
            this.isConnected = true;
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from WebSocket');
            this.isConnected = false;
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ WebSocket connection error:', error);
        });

        return this.socket;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
        }
    }

    // Mentor/Admin joins monitoring
    joinMonitoring(userId, role, mentorId = null) {
        if (!this.socket) this.connect();
        this.socket.emit('join_monitoring', { userId, role, mentorId });
    }

    // Student joins their session room (to receive agent commands like terminate)
    joinStudentSession(studentId, sessionId) {
        if (!this.socket) this.connect();
        this.socket.emit('join_student_session', { studentId, sessionId });
    }

    // Listen for agent terminate signal
    onAgentTerminate(callback) {
        if (!this.socket) this.connect();
        this.socket.on('agent_terminate', callback);
    }

    // Student emits submission started
    emitSubmissionStarted(studentId, studentName, problemId, problemTitle, mentorId, isProctored = false) {
        if (!this.socket) this.connect();
        this.socket.emit('submission_started', {
            studentId,
            studentName,
            problemId,
            problemTitle,
            mentorId,
            isProctored
        });
    }

    // Student emits submission completed
    emitSubmissionCompleted(studentId, studentName, problemId, problemTitle, mentorId, status, score) {
        if (!this.socket) this.connect();
        this.socket.emit('submission_completed', {
            studentId,
            studentName,
            problemId,
            problemTitle,
            mentorId,
            status, // 'success' | 'failed' | 'partial'
            score
        });
    }

    // Emit proctoring violation
    emitProctoringViolation(studentId, studentName, violationType, severity, mentorId) {
        if (!this.socket) this.connect();
        this.socket.emit('proctoring_violation', {
            studentId,
            studentName,
            violationType,
            severity,
            mentorId
        });
    }

    // Emit progress update
    emitProgressUpdate(studentId, problemId, progress, mentorId) {
        if (!this.socket) this.connect();
        this.socket.emit('progress_update', {
            studentId,
            problemId,
            progress,
            mentorId
        });
    }

    // Emit test failure
    emitTestFailed(studentId, studentName, problemId, testname, mentorId) {
        if (!this.socket) this.connect();
        this.socket.emit('test_failed', {
            studentId,
            studentName,
            problemId,
            testname,
            mentorId
        });
    }

    // Listen for live updates
    onLiveUpdate(callback) {
        if (!this.socket) this.connect();
        this.socket.on('live_update', callback);
    }

    // Listen for live alerts
    onLiveAlert(callback) {
        if (!this.socket) this.connect();
        this.socket.on('live_alert', callback);
    }

    // Listen for monitoring connected
    onMonitoringConnected(callback) {
        if (!this.socket) this.connect();
        this.socket.on('monitoring_connected', callback);
    }

    // Remove event listeners
    removeListener(event) {
        if (this.socket) {
            this.socket.off(event);
        }
    }

    // Emit custom event
    emit(event, data) {
        if (!this.socket) this.connect();
        this.socket.emit(event, data);
    }

    // Listen to custom event
    on(event, callback) {
        if (!this.socket) this.connect();
        this.socket.on(event, callback);
    }
}

export default new SocketService();
