const { createApp, ref, reactive } = Vue;

createApp({
  setup() {
    const MIN_DURATION = 1000;
    const status = ref("准备就绪");
    const recordBtnText = ref("开始录音");
    const recordings = ref([]);

    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let startTime = null;

    const updateStatus = text => {
      status.value = text;
    };

    const startRecording = async () => {
      if (isRecording) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        startTime = Date.now();

        mediaRecorder.ondataavailable = event => {
          audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const duration = Date.now() - startTime;
          mediaRecorder.stream.getTracks().forEach(track => track.stop());

          if (duration < MIN_DURATION) {
            updateStatus("录音时间太短");
            isRecording = false;
            recordBtnText.value = "开始录音";
            return;
          }

          const durationInSeconds = (duration / 1000).toFixed(1);
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          const audioUrl = URL.createObjectURL(audioBlob);

          const recording = reactive({
            url: audioUrl,
            duration: durationInSeconds,
            timestamp: new Date().toLocaleTimeString(),
            isPlaying: false,
            progress: 0,
            noTransition: false,
            audio: new Audio(audioUrl)
          });

          recording.audio.addEventListener("timeupdate", () => {
            if (recording.isPlaying) {
              recording.progress = (recording.audio.currentTime / recording.audio.duration) * 100;
            }
          });

          recording.audio.addEventListener("ended", () => {
            recording.isPlaying = false;
            recording.noTransition = true;
            recording.progress = 0;
            setTimeout(() => (recording.noTransition = false), 0);
          });

          recordings.value.push(recording);
          updateStatus("录音完成");
          isRecording = false;
          recordBtnText.value = "开始录音";
        };

        mediaRecorder.start();
        isRecording = true;
        updateStatus("正在录音...");
        recordBtnText.value = "停止录音";
      } catch (err) {
        console.error("访问麦克风失败:", err);
        updateStatus("无法访问麦克风");
        isRecording = false;
        recordBtnText.value = "开始录音";
      }
    };

    const stopRecording = () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    };

    const togglePlay = recording => {
      // 停止其他所有录音
      recordings.value.forEach(r => {
        if (r !== recording && r.isPlaying) {
          r.audio.pause();
          r.audio.currentTime = 0;
          r.isPlaying = false;
          r.noTransition = true;
          r.progress = 0;
          setTimeout(() => (r.noTransition = false), 0);
        }
      });

      if (recording.audio.paused) {
        recording.audio.play();
        recording.isPlaying = true;
      } else {
        recording.audio.pause();
        recording.audio.currentTime = 0;
        recording.isPlaying = false;
        recording.noTransition = true;
        recording.progress = 0;
        setTimeout(() => (recording.noTransition = false), 0);
      }
    };

    return {
      status,
      recordBtnText,
      recordings,
      startRecording,
      stopRecording,
      togglePlay
    };
  }
}).mount("#app");
