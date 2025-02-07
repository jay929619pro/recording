// 使用立即执行函数包裹代码,避免全局变量污染
(async () => {
  // 用于存储录音数据的数组
  let leftchannel = []; // 左声道数据
  let rightchannel = []; // 右声道数据
  let recorder = null; // 录音处理器
  let recording = false; // 录音状态标志
  let recordingLength = 0; // 记录录音长度
  let audioInput = null; // 音频输入源
  let sampleRate = null; // 采样率
  let AudioContext = window.AudioContext || window.webkitAudioContext; // 音频上下文对象的兼容处理
  let context = null; // 音频上下文
  let stream = null; // 媒体流

  // 检查是否已有麦克风权限
  async function checkMicrophonePermission() {
    try {
      const permissionStatus = await navigator.permissions.query({ name: "microphone" });
      return permissionStatus.state === "granted";
    } catch (err) {
      // 如果浏览器不支持权限查询,则返回false
      return false;
    }
  }

  // 请求麦克风权限并获取音频流
  async function getStream() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      return true;
    } catch (err) {
      alert("获取麦克风失败: " + err.message);
      return false;
    }
  }

  // 设置录音环境
  function setUpRecording() {
    // 创建音频上下文
    context = new AudioContext();
    sampleRate = context.sampleRate;

    // 创建媒体音频源节点
    audioInput = context.createMediaStreamSource(stream);

    // 创建脚本处理器节点
    let bufferSize = 2048;
    recorder = context.createScriptProcessor(bufferSize, 2, 2);

    // 连接节点: 音频输入 -> 录音处理器 -> 输出设备
    audioInput.connect(recorder);
    recorder.connect(context.destination);

    // 处理音频数据
    recorder.onaudioprocess = function (e) {
      if (!recording) return;

      // 获取左右声道的输入数据
      let left = e.inputBuffer.getChannelData(0);
      let right = e.inputBuffer.getChannelData(1);

      // 将数据保存到对应声道的数组中
      leftchannel.push(new Float32Array(left));
      rightchannel.push(new Float32Array(right));
      recordingLength += bufferSize;
    };
  }

  // 合并缓冲区数据
  function mergeBuffers(channelBuffer, recordingLength) {
    let result = new Float32Array(recordingLength);
    let offset = 0;
    // 将所有的缓冲区数据合并到一个大的数组中
    for (let i = 0; i < channelBuffer.length; i++) {
      result.set(channelBuffer[i], offset);
      offset += channelBuffer[i].length;
    }
    return result;
  }

  // 交错左右声道数据
  function interleave(leftChannel, rightChannel) {
    let length = leftChannel.length + rightChannel.length;
    let result = new Float32Array(length);
    let inputIndex = 0;

    // 交替放置左右声道的数据
    for (let index = 0; index < length; ) {
      result[index++] = leftChannel[inputIndex];
      result[index++] = rightChannel[inputIndex];
      inputIndex++;
    }
    return result;
  }

  // 写入 UTF-8 字符串到数据视图
  function writeUTFBytes(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // 开始录音
  async function start() {
    // 如果还没有获取到媒体流,先检查权限
    if (!stream) {
      const hasPermission = await checkMicrophonePermission();
      // 如果已经有权限,直接获取媒体流
      if (hasPermission) {
        await getStream();
      } else {
        // 没有权限,请求权限
        const granted = await getStream();
        if (!granted) return;
        return; // 首次获取权限后直接返回,不开始录音
      }
    }

    // 已有权限,开始录音
    recording = true;
    document.querySelector("#msg").style.visibility = "visible";
    // 重置录音数据
    leftchannel.length = rightchannel.length = 0;
    recordingLength = 0;
    // 如果上下文不存在则初始化录音环境
    if (!context) setUpRecording();
  }

  // 停止录音
  function stop() {
    recording = false;
    document.querySelector("#msg").style.visibility = "hidden";

    // 合并左右声道的数据
    let leftBuffer = mergeBuffers(leftchannel, recordingLength);
    let rightBuffer = mergeBuffers(rightchannel, recordingLength);
    // 交错左右声道数据
    let interleaved = interleave(leftBuffer, rightBuffer);

    // 创建WAV文件
    let buffer = new ArrayBuffer(44 + interleaved.length * 2);
    let view = new DataView(buffer);

    // 写入WAV文件头
    // RIFF chunk descriptor
    writeUTFBytes(view, 0, "RIFF");
    view.setUint32(4, 44 + interleaved.length * 2, true);
    writeUTFBytes(view, 8, "WAVE");
    // format chunk
    writeUTFBytes(view, 12, "fmt ");
    view.setUint32(16, 16, true); // format chunk length
    view.setUint16(20, 1, true); // sample format (raw)
    view.setUint16(22, 2, true); // channel count
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * 4, true); // byte rate (sample rate * block align)
    view.setUint16(32, 4, true); // block align (channel count * bytes per sample)
    view.setUint16(34, 16, true); // bits per sample
    // data chunk
    writeUTFBytes(view, 36, "data");
    view.setUint32(40, interleaved.length * 2, true);

    // 写入PCM音频数据
    let index = 44;
    for (let i = 0; i < interleaved.length; i++) {
      view.setInt16(index, interleaved[i] * 0x7fff, true);
      index += 2;
    }

    // 创建Blob对象并设置到audio元素中播放
    const blob = new Blob([view], { type: "audio/wav" });
    const audioUrl = URL.createObjectURL(blob);
    document.querySelector("#audio").setAttribute("src", audioUrl);
  }

  // 绑定按钮事件
  document.querySelector("#record").onclick = start;
  document.querySelector("#stop").onclick = stop;
})();
