const { createApp, ref, onMounted } = Vue;

// 创建 Vue 应用
const app = createApp({
  setup() {
    // 状态变量
    const leftchannel = ref([]);
    const rightchannel = ref([]);
    const recorder = ref(null);
    const recording = ref(false);
    const recordingLength = ref(0);
    const audioInput = ref(null);
    const sampleRate = ref(null);
    const context = ref(null);
    const stream = ref(null);
    const audioElement = ref(null);
    const audioList = ref([]);
    const currentPlayingIndex = ref(null);

    const AudioContext = window.AudioContext || window.webkitAudioContext;

    // 检查麦克风权限
    const checkMicrophonePermission = async () => {
      try {
        const permissionStatus = await navigator.permissions.query({ name: "microphone" });
        return permissionStatus.state; // 返回具体状态，而不是布尔值
      } catch (err) {
        return "prompt"; // 如果不支持权限查询，返回 prompt 状态
      }
    };

    // 获取音频流
    const getStream = async () => {
      try {
        stream.value = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        return true;
      } catch (err) {
        alert("获取麦克风失败: " + err.message);
        return false;
      }
    };

    // 设置录音环境
    const setUpRecording = () => {
      context.value = new AudioContext();
      sampleRate.value = context.value.sampleRate;

      audioInput.value = context.value.createMediaStreamSource(stream.value);

      const bufferSize = 2048;
      recorder.value = context.value.createScriptProcessor(bufferSize, 2, 2);

      audioInput.value.connect(recorder.value);
      recorder.value.connect(context.value.destination);

      recorder.value.onaudioprocess = function (e) {
        if (!recording.value) return;

        const left = e.inputBuffer.getChannelData(0);
        const right = e.inputBuffer.getChannelData(1);

        leftchannel.value.push(new Float32Array(left));
        rightchannel.value.push(new Float32Array(right));
        recordingLength.value += bufferSize;
      };
    };

    // 合并缓冲区数据
    const mergeBuffers = (channelBuffer, length) => {
      const result = new Float32Array(length);
      let offset = 0;
      for (let i = 0; i < channelBuffer.length; i++) {
        result.set(channelBuffer[i], offset);
        offset += channelBuffer[i].length;
      }
      return result;
    };

    // 交错左右声道数据
    const interleave = (leftChannel, rightChannel) => {
      const length = leftChannel.length + rightChannel.length;
      const result = new Float32Array(length);
      let inputIndex = 0;

      for (let index = 0; index < length; ) {
        result[index++] = leftChannel[inputIndex];
        result[index++] = rightChannel[inputIndex];
        inputIndex++;
      }
      return result;
    };

    // 写入 UTF-8 字符串
    const writeUTFBytes = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // 开始录音
    const start = async () => {
      const permissionState = await checkMicrophonePermission();

      // 如果权限状态是 denied，提示用户在浏览器设置中允许麦克风访问
      if (permissionState === "denied") {
        alert("请在浏览器设置中允许访问麦克风，然后重试");
        return;
      }

      // 如果没有音频流，先获取权限
      if (!stream.value) {
        const granted = await getStream();
        if (!granted) return;
        // 首次获取权限成功后，直接返回，不开始录音
        return;
      }

      // 已有权限时，开始录音
      recording.value = true;
      leftchannel.value.length = rightchannel.value.length = 0;
      recordingLength.value = 0;
      if (!context.value) setUpRecording();
    };

    // 停止录音
    const stop = () => {
      recording.value = false;

      const leftBuffer = mergeBuffers(leftchannel.value, recordingLength.value);
      const rightBuffer = mergeBuffers(rightchannel.value, recordingLength.value);
      const interleaved = interleave(leftBuffer, rightBuffer);

      const buffer = new ArrayBuffer(44 + interleaved.length * 2);
      const view = new DataView(buffer);

      // 写入WAV文件头
      writeUTFBytes(view, 0, "RIFF");
      view.setUint32(4, 44 + interleaved.length * 2, true);
      writeUTFBytes(view, 8, "WAVE");
      writeUTFBytes(view, 12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 2, true);
      view.setUint32(24, sampleRate.value, true);
      view.setUint32(28, sampleRate.value * 4, true);
      view.setUint16(32, 4, true);
      view.setUint16(34, 16, true);
      writeUTFBytes(view, 36, "data");
      view.setUint32(40, interleaved.length * 2, true);

      let index = 44;
      for (let i = 0; i < interleaved.length; i++) {
        view.setInt16(index, interleaved[i] * 0x7fff, true);
        index += 2;
      }

      const blob = new Blob([view], { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(blob);

      // 添加新录音到列表
      audioList.value.push({
        url: audioUrl,
        timestamp: new Date().toLocaleTimeString()
      });
    };

    // 新增：删除录音
    const deleteAudio = index => {
      URL.revokeObjectURL(audioList.value[index].url); // 释放URL
      audioList.value.splice(index, 1);
    };

    // 处理音频播放
    const handlePlay = (event, index) => {
      // 如果点击的不是当前正在播放的音频
      if (currentPlayingIndex.value !== index) {
        // 停止当前正在播放的音频
        if (currentPlayingIndex.value !== null) {
          const currentAudio = document.querySelectorAll("audio")[currentPlayingIndex.value];
          currentAudio.pause();
          currentAudio.currentTime = 0;
        }
        // 更新当前播放的音频索引
        currentPlayingIndex.value = index;
      }
    };

    // 监听音频结束事件
    const handleEnded = () => {
      currentPlayingIndex.value = null;
    };

    // 在组件挂载后添加音频结束事件监听
    onMounted(() => {
      document.addEventListener("ended", handleEnded, true);
    });

    return {
      recording,
      audioList,
      audioElement,
      start,
      stop,
      deleteAudio,
      handlePlay
    };
  }
});

// 挂载应用
app.mount("#app");
