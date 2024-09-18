require('dotenv').config()
const sdk = require('microsoft-cognitiveservices-speech-sdk')
// const blendShapeNames = require('./blendshapeNames')
const _ = require('lodash')
const { runAndRetrieveMessageCompleted } = require('./openai')
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const path = require('path')
const Ffmpeg = require('fluent-ffmpeg')

let SSML = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="it-IT">
<voice name="it-IT-DiegoNeural">
  __TEXT__
</voice>
</speak>`

// <mstts:viseme type="Articulation" />
// <mstts:viseme type="Viseme" />
// <mstts:viseme type="FacialExpression" />

const key = process.env.AZURE_KEY
const key_STT = process.env.AZURE_KEY_STT
const region = process.env.AZURE_REGION

/**
 * Node.js server code to convert text to speech
 * @returns stream
 * @param {*} key your resource key
 * @param {*} region your resource region
 * @param {*} text text to convert to audio/speech
 * @param {*} filename optional - best for long text - temp file for converted speech/audio
 */

const textToSpeech = async ({ threadId, audio }) => {
	console.log('tts')
	let text = 'qualcosa e andato storto'
	// let text = 'ho trovato il guidatore ubriaco'

	let firstText = text

	firstText = await speechToTextFromBlob(audio.buffer)
	text = firstText

	threadId = threadId === 'undefined' ? undefined : threadId

	console.log('gpt')
	console.time('Execution Time')

	let a = await runAndRetrieveMessageCompleted({ threadId, content: text })
	a.response = a.response.replace(/\#/g, "").replace(/\[.*?source.*?\]/g, "").replace(/【.*?source.*?】/g, "")

	console.timeEnd('Execution Time')
	text = a.response

	return new Promise((resolve, reject) => {

		let ssml = SSML.replace("__TEXT__", text)

		const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
		speechConfig.speechSynthesisOutputFormat = 5 // mp3

		let audioConfig = null

		let randomString = Date.now()
		let filename = `./public/speech-${randomString}.mp3`
		audioConfig = sdk.AudioConfig.fromAudioFileOutput(filename)

		let blendData = []
		// let timeStep = 1 / 60
		// let timeStamp = 0

		const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig)

		synthesizer.visemeReceived = function (s, e) {
			blendData.push({
				time: e.privAudioOffset / 10000000,
				viseme: e.privVisemeId
			}
			)

			// var animation = JSON.parse(e.animation)
			// _.each(animation.BlendShapes, blendArray => {
			// 	let blend = {}
			// 	_.each(blendShapeNames, (shapeName, i) => {
			// 		blend[shapeName] = blendArray[i]
			// 	})

			// 	blendData.push({
			// 		time: timeStamp,
			// 		blendshapes: blend
			// 	})
			// 	timeStamp += timeStep
			// })
		}

		synthesizer.speakSsmlAsync(
			ssml,
			result => {
				synthesizer.close()
				console.log(result)
				setTimeout(() => {
					const ja = path.join(__dirname, '..', 'public', `speech-${randomString}.mp3`)
					fs.unlink(ja, () => { })
				}, 120000);
				resolve({ blendData, threadId: a.threadId, filename: `/speech-${randomString}.mp3`, text: firstText, response: a.response })
			},
			error => {
				synthesizer.close()
				console.log(error)
				reject(error)
			})
	})
}

const speechToTextFromBlob = async (audio) => {
	return new Promise(async (resolve, reject) => {
		let pushStream = sdk.AudioInputStream.createPushStream()

		let outputPath = `${Date.now()}.wav`
		let inputPath = `temp-${Date.now()}.webm`

		await convertWebMToWav(audio, inputPath, outputPath)

		fs.createReadStream('./helpers/' + outputPath).on('data', function (arrayBuffer) {
			pushStream.write(arrayBuffer.slice())
		}).on('end', function () {
			pushStream.close()
		})

		const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream)

		const speechConfig = sdk.SpeechConfig.fromSubscription(key_STT, region)
		speechConfig.speechRecognitionLanguage = 'it-IT'

		const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)

		recognizer.recognizeOnceAsync(result => {
			if (result.reason === sdk.ResultReason.RecognizedSpeech) {
				setTimeout(() => {
					const ja = path.join(__dirname, outputPath)
					fs.unlink(ja, () => { })
				}, 1000);
				resolve(result.text)
			} else {
				reject(new Error('Speech recognition failed.'))
			}


			recognizer.close()
			recognizer = undefined
		})
	})
}

const convertWebMToWav = (inputBuffer, inputFilename, outputFilename) => {
	const inputPath = path.join(__dirname, inputFilename)

	// const inputPath = path.join(__dirname, 'audio (1).webm')

	const outputPath = path.join(__dirname, outputFilename)

	fs.writeFileSync(inputPath, inputBuffer)

	return new Promise((resolve, reject) => {
		Ffmpeg(inputPath)
			.toFormat('wav')
			.audioCodec('pcm_s16le')
			.audioChannels(1)
			.audioFrequency(16000)
			.on('end', () => {
				fs.unlinkSync(inputPath)
				resolve(outputPath)
			})
			.on('error', (err) => {
				console.error('Error durante la conversión:', err)
				reject(err)
			})
			.save(outputPath)
	})
}

module.exports = textToSpeech