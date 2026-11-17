use std::io::{self, BufReader, BufWriter, Read, Write};

use preflate_container::{
    PreflateContainerConfig, PreflateContainerProcessor, ProcessBuffer, RecreateContainerProcessor,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mode = std::env::args().nth(1);
    let mut input = BufReader::with_capacity(256 * 1024, io::stdin().lock());
    let mut output = BufWriter::with_capacity(256 * 1024, io::stdout().lock());
    let mut config = PreflateContainerConfig::default();
    match mode.as_deref() {
        Some("pack") => {
            // The release builder verifies each candidate with the shipped decoder.
            config.validate_compression = false;
            PreflateContainerProcessor::new(&config, 9, false)
                .copy_to_end(&mut input, &mut output)?;
        }
        Some("unpack") => {
            RecreateContainerProcessor::new(config.chunk_plain_text_limit)
                .copy_to_end(&mut input, &mut output)?;
        }
        Some("pack-thumbnail") => pack_thumbnail(&mut input, &mut output)?,
        _ => return Err("Use pack, unpack or pack-thumbnail with the input on stdin.".into()),
    }
    output.flush()?;
    Ok(())
}

fn pack_thumbnail(
    mut input: impl Read,
    mut output: impl Write,
) -> Result<(), Box<dyn std::error::Error>> {
    const MAX_EDGE: u32 = 480;
    let mut size = [0; 8];
    input.read_exact(&mut size)?;
    let width = u32::from_le_bytes(size[..4].try_into()?);
    let height = u32::from_le_bytes(size[4..].try_into()?);
    if width == 0 || height == 0 || width > MAX_EDGE || height > MAX_EDGE {
        return Err("Invalid thumbnail dimensions.".into());
    }
    let expected = (width * height * 4) as usize;
    let mut pixels = Vec::with_capacity(expected);
    input.take(expected as u64 + 1).read_to_end(&mut pixels)?;
    if pixels.len() != expected {
        return Err("Invalid thumbnail pixel count.".into());
    }
    let mut config = webp::WebPConfig::new().map_err(|_| "Cannot initialize WebP encoder.")?;
    if unsafe { libwebp_sys::WebPConfigLosslessPreset(&mut config, 6) } == 0 {
        return Err("Cannot initialize the lossless WebP preset.".into());
    }
    config.exact = 1;
    let encoded = webp::Encoder::from_rgba(&pixels, width, height)
        .encode_advanced(&config)
        .map_err(|error| format!("Cannot encode thumbnail: {error:?}"))?;
    output.write_all(&encoded)?;
    Ok(())
}
