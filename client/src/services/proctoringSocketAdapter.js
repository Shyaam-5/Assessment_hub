import socketService from '@/services/socketService'

function callSocket(method, ...args) {
    const fn = socketService?.[method]
    if (typeof fn === 'function') {
        fn.apply(socketService, args)
        return true
    }
    console.warn(`[SocketAdapter] Missing socket method: ${method}`)
    return false
}

const proctoringSocketAdapter = {
    connect() {
        return callSocket('connect')
    },
    joinStudentSession(studentId, sessionId) {
        return callSocket('joinStudentSession', studentId, sessionId)
    },
    onAgentTerminate(callback) {
        return callSocket('onAgentTerminate', callback)
    },
    emitSubmissionCompleted(studentId, studentName, problemId, problemTitle, mentorId, status, score) {
        return callSocket(
            'emitSubmissionCompleted',
            studentId,
            studentName,
            problemId,
            problemTitle,
            mentorId,
            status,
            score,
        )
    },
    removeListener(eventName) {
        return callSocket('removeListener', eventName)
    },
}

export default proctoringSocketAdapter
