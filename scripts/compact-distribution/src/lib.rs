// A gallery worker owns this instance and calls it synchronously.
#[cfg(target_arch = "wasm32")]
mod thumbnail {
    use libwebp_sys::WebPDecodeRGBAInto;
    use webp::{BitstreamFeatures, BitstreamFormat};

    const MAX_EDGE: usize = 480;
    const MAX_INPUT: usize = 1024 * 1024;
    static mut INPUT: [u8; MAX_INPUT] = [0; MAX_INPUT];
    static mut RGBA: [u8; MAX_EDGE * MAX_EDGE * 4] = [0; MAX_EDGE * MAX_EDGE * 4];

    #[unsafe(no_mangle)]
    pub extern "C" fn thumbnail_input() -> *mut u8 {
        (&raw mut INPUT).cast()
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn thumbnail_rgba() -> *mut u8 {
        (&raw mut RGBA).cast()
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn thumbnail_decode(length: usize) -> u32 {
        if length == 0 || length > MAX_INPUT {
            return 0;
        }
        // The input and output point at distinct bounded buffers owned by this instance.
        let input = unsafe { std::slice::from_raw_parts(thumbnail_input(), length) };
        let Some(features) = BitstreamFeatures::new(input) else {
            return 0;
        };
        let width = features.width() as usize;
        let height = features.height() as usize;
        if width == 0
            || height == 0
            || width > MAX_EDGE
            || height > MAX_EDGE
            || features.has_animation()
            || !matches!(features.format(), Some(BitstreamFormat::Lossless))
        {
            return 0;
        }
        let decoded = unsafe {
            WebPDecodeRGBAInto(
                input.as_ptr(),
                input.len(),
                thumbnail_rgba(),
                width * height * 4,
                (width * 4) as i32,
            )
        };
        if decoded.is_null() {
            return 0;
        }
        ((width as u32) << 16) | height as u32
    }
}
