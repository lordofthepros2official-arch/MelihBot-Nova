/**
 * Sistemin birincil/varsayılan mikrofonunu ister. `deviceId: "default"`
 * tarayıcıya AÇIKÇA OS'in o an bildirdiği varsayılan cihazı kullanmasını
 * söyler (deviceId hiç verilmezse teorik olarak aynı sonucu vermesi
 * gerekir, ama bazı Chromium sürümlerinde varsayılan cihaz değiştiğinde
 * eski cihazda "takılı kalma" bilinen bir sorundur — bkz. crbug.com/40199570).
 *
 * Bare (exact olmayan) `deviceId` değeri "ideal" constraint sayıldığı için
 * normalde hata fırlatmaz; yine de bazı nadir ortamlarda (özel donanım,
 * bazı Linux sürücüleri) bu constraint'in kabul edilmediği görülebilir. Bu
 * durumda hiçbir constraint olmadan (`audio: true`) tekrar denenir, ki
 * mikrofon erişimi hiçbir ortamda tamamen kırılmasın.
 */
export async function getPrimaryMicStream(
  extra: Omit<MediaTrackConstraints, "deviceId"> = {},
): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: "default", ...extra },
    });
  } catch (e) {
    console.warn(
      "[mic-device] 'default' mikrofon kısıtlamasıyla erişim başarısız, kısıtlamasız tekrar deneniyor:",
      e,
    );
    return navigator.mediaDevices.getUserMedia({ audio: Object.keys(extra).length ? extra : true });
  }
}
