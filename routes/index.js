var express = require('express')
var router = express.Router()
var textToSpeech = require('../helpers/tts')
const multer = require('multer')
const upload = multer()

router.post('/talk', upload.single('audio'), function (req, res, next) {
  textToSpeech({ ...req.body, audio: req.file })
    .then(result => {
      console.log(result)
      res.json(result)
    })
    .catch(err => {
      console.log(err)
      res.json({})
    })
})

module.exports = router
