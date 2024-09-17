const OpenAI = require('openai')

const { OPENAI_API_KEY: apiKey, ASSISTANT_ID } = process.env

const openai = new OpenAI({ apiKey })
const { files, models } = openai
const { assistants, threads, vectorStores } = openai.beta
const { messages, runs } = threads
const { files: vectorStoresFiles } = vectorStores

// messages, threads and runs
async function createMessage({ threadId, content }) {
    const messageResult = await messages.create(threadId, { role: 'user', content })

    if (messageResult.error) throw new Error(messageResult.error.message)

    return messageResult
}

async function runThread({ threadId, assistantId }) {
    const runResult = await runs.create(threadId, { assistant_id: assistantId })

    const result = { runId: runResult.id }
    return result
}

async function createMessageAndRun({ threadId, content, assistantId }) {
    await createMessage({ threadId, content })

    const result = await runThread({ threadId, assistantId })

    return result
}

async function createThreadAndRun({ content, assistantId }) {
    const thread = { messages: [{ role: 'user', content }] }

    const runResult = await threads.createAndRun({ assistant_id: assistantId, thread })

    const result = { runId: runResult.id, threadId: runResult.thread_id }
    return result
}

async function runMessage({ threadId, content }) {
    let runId, newThreadId

    const assistantId = ASSISTANT_ID

    if (threadId) {
        let result = await createMessageAndRun({ threadId, content, assistantId })
        runId = result.runId
    } else {
        let result = await createThreadAndRun({ content, assistantId })
        runId = result.runId
        newThreadId = result.threadId
    }

    return { threadId: threadId ?? newThreadId, runId }
}

async function retrieveRunStatus(threadId, runId) {
    const runResult = await runs.retrieve(threadId, runId)

    if (runResult.error) throw new Error(runResult.error.message)
    if (runResult.status === 'failed') throw new Error(runResult.last_error.message)

    const { status } = runResult
    return status
}

async function retrieveLastMessage(threadId) {
    const messageResult = await messages.list(threadId, { limit: 1 })

    if (messageResult.error) throw new Error(messageResult.error.message)

    const response = messageResult.data[0].content[0].text.value
    return response
}

async function retrieveLastMessageWhenRunStatusIsCompleted(threadId, runId) {
    let runStatus = await retrieveRunStatus(threadId, runId)

    let needsTimeout = false
    const timeout = setTimeout(() => (needsTimeout = true), 25000)

    while (runStatus !== 'completed') {
        if (needsTimeout) throw new Error('timeout exceed')
        runStatus = await retrieveRunStatus(threadId, runId)
    }

    clearTimeout(timeout)
    const lastMessage = await retrieveLastMessage(threadId)
    return lastMessage
}

async function runAndRetrieveMessageCompleted({ threadId, content }) {
    const { threadId: newThreadId, runId } = await runMessage({ threadId, content })

    const response = await retrieveLastMessageWhenRunStatusIsCompleted(newThreadId, runId)

    return { threadId: newThreadId, response }
}

module.exports = {
    files,
    models,
    assistants,
    threads,
    vectorStores,
    messages,
    runs,
    vectorStoresFiles,
    createMessage,
    runThread,
    createMessageAndRun,
    createThreadAndRun,
    runMessage,
    retrieveRunStatus,
    retrieveLastMessage,
    retrieveLastMessageWhenRunStatusIsCompleted,
    runAndRetrieveMessageCompleted,
}
