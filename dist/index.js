import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import sharp from "sharp";
import { z } from "zod";
import path from "node:path";
const server = new McpServer({
    name: "ImageProcessor",
    version: "1.0.0",
    description: "Image processing server using sharp library"
});
// 通用文件处理函数
async function processImages(imagePaths, processor, suffix, outputFormat) {
    const results = [];
    for (const path of imagePaths) {
        try {
            const image = sharp(path);
            const processed = await processor(image);
            let outputPath = path.replace(/(\.[\w\d]+)$/, `_${suffix}$1`);
            // 对于格式转换工具，使用新的格式作为扩展名
            if (suffix === 'converted') {
                outputPath = outputPath.replace(/\.[^/.]+$/, `.${outputFormat}`);
            }
            await processed.toFile(outputPath);
            results.push({ path, success: true, outputPath });
        }
        catch (error) {
            results.push({
                path,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    return results;
}
// 1. 图像格式转换工具
server.tool("image.convertFormat", {
    imagesPath: z.array(z.string().transform(p => p.replace(/[\\/]/g, path.sep))).min(1).describe("Array of image file paths(please use absolute path)"),
    outputFormat: z.enum(["jpeg", "png", "webp", "tiff", "gif", "avif", "heif"])
        .describe("Target format to convert images to"),
    formatParams: z.object({
        quality: z.number().min(0).max(100).optional()
            .describe("Output quality percentage (0-100)"),
        compressionLevel: z.number().min(0).max(9).optional()
            .describe("Compression level (0-9 where 9 is maximum)")
    }).optional().describe("Optional format-specific parameters")
}, async ({ imagesPath, outputFormat, formatParams }) => {
    const results = await processImages(imagesPath, async (image) => {
        let processed = image.toFormat(outputFormat);
        if (formatParams?.quality) {
            processed = processed[outputFormat]({ quality: formatParams.quality });
        }
        if (formatParams?.compressionLevel) {
            processed = processed[outputFormat]({
                compressionLevel: formatParams.compressionLevel
            });
        }
        return processed;
    }, "converted", outputFormat);
    return {
        content: results.map(result => ({
            type: "text",
            text: result.success
                ? `Converted ${result.path} → ${result.outputPath}`
                : `Failed to convert ${result.path}: ${result.error}`
        }))
    };
});
// 2. 图像裁剪与尺寸调整工具
server.tool("image.cropResize", {
    imagesPath: z.array(z.string().transform(p => p.replace(/[\\/]/g, path.sep))).min(1).describe("Array of image file paths(please use absolute path)"),
    width: z.number().positive().optional()
        .describe("Target width in pixels (maintains aspect ratio if height not specified)"),
    height: z.number().positive().optional()
        .describe("Target height in pixels (maintains aspect ratio if width not specified)"),
    resizeMode: z.enum(["contain", "cover", "fill", "inside", "outside"])
        .describe("How to fit the image to the target dimensions"),
    maintainRatio: z.boolean().default(true)
        .describe("Whether to maintain original aspect ratio"),
    rotate: z.number().optional()
        .describe("Rotation angle in degrees (-360 to 360)"),
    flip: z.boolean().optional()
        .describe("Flip image vertically"),
    mirror: z.boolean().optional()
        .describe("Flip image horizontally")
}, async ({ imagesPath, width, height, resizeMode, maintainRatio, rotate, flip, mirror }) => {
    const results = await processImages(imagesPath, async (image) => {
        let processed = image;
        if (width || height) {
            processed = processed.resize({
                width,
                height,
                fit: resizeMode,
                withoutEnlargement: resizeMode === 'inside',
                position: 'centre'
            });
        }
        if (rotate)
            processed = processed.rotate(rotate);
        if (flip)
            processed = processed.flip();
        if (mirror)
            processed = processed.flop();
        return processed;
    }, "cropped");
    return {
        content: results.map(result => ({
            type: "text",
            text: result.success
                ? `Processed ${result.path} → ${result.outputPath}`
                : `Failed to process ${result.path}: ${result.error}`
        }))
    };
});
// 3. 图像压缩与优化工具
server.tool("image.compressOptimize", {
    imagesPath: z.array(z.string().transform(p => p.replace(/[\\/]/g, path.sep))).min(1).describe("Array of image file paths(please use absolute path)"),
    quality: z.number().min(0).max(100).optional()
        .describe("Output quality percentage (0-100)"),
    stripMetadata: z.boolean().default(true)
        .describe("Remove EXIF and other metadata from images"),
    progressive: z.boolean().optional()
        .describe("Use progressive/interlaced rendering for JPEG/PNG")
}, async ({ imagesPath, quality, stripMetadata, progressive }) => {
    const results = await processImages(imagesPath, async (image) => {
        let processed = image;
        if (stripMetadata)
            processed = processed.withMetadata();
        if (quality)
            processed = processed.jpeg({ quality }).webp({ quality });
        if (progressive)
            processed = processed.jpeg({ progressive }).png({ progressive });
        return processed;
    }, "compressed");
    return {
        content: results.map(result => ({
            type: "text",
            text: result.success
                ? `Compressed ${result.path} → ${result.outputPath}`
                : `Failed to compress ${result.path}: ${result.error}`
        }))
    };
});
// 4. 图像缩放工具
server.tool("image.resize", {
    imagesPath: z.array(z.string().transform(p => p.replace(/[\\/]/g, path.sep))).min(1).describe("Array of image file paths(please use absolute path)"),
    width: z.number().positive().optional()
        .describe("Target width in pixels"),
    height: z.number().positive().optional()
        .describe("Target height in pixels"),
    maintainRatio: z.boolean().default(true)
        .describe("Maintain original aspect ratio when resizing"),
    fitMode: z.enum(["contain", "cover", "fill", "inside", "outside"]).optional()
        .describe("How to fit image to target dimensions")
}, async ({ imagesPath, width, height, maintainRatio, fitMode }) => {
    // 参数校验
    if (maintainRatio && width && height) {
        const metadata = await sharp(imagesPath[0]).metadata();
        if (metadata.width && metadata.height) {
            const originalRatio = metadata.width / metadata.height;
            const targetRatio = width / height;
            if (Math.abs(originalRatio - targetRatio) > 0.01) {
                return {
                    content: [{
                            type: "text",
                            text: "错误：保持比例模式下，指定的宽高比例与原图不一致，请调整参数。"
                        }],
                    isError: true
                };
            }
        }
    }
    const results = await processImages(imagesPath, async (image) => {
        const processed = image.resize({
            width,
            height,
            fit: fitMode || (maintainRatio ? 'contain' : 'fill'),
            withoutEnlargement: fitMode === 'inside',
            position: 'centre'
        });
        return processed;
    }, "resized");
    return {
        content: results.map(result => ({
            type: "text",
            text: result.success
                ? `Resized ${result.path} → ${result.outputPath}`
                : `Failed to resize ${result.path}: ${result.error}`
        }))
    };
});
// 5. 旋转与翻转工具
server.tool("image.rotateFlip", {
    imagesPath: z.array(z.string().transform(p => p.replace(/[\\/]/g, path.sep))).min(1).describe("Array of image file paths(please use absolute path)"),
    rotateAngle: z.number().min(-360).max(360).optional()
        .describe("Rotation angle in degrees (-360 to 360)"),
    flipHorizontal: z.boolean().optional()
        .describe("Flip image horizontally (mirror effect)"),
    flipVertical: z.boolean().optional()
        .describe("Flip image vertically")
}, async ({ imagesPath, rotateAngle, flipHorizontal, flipVertical }) => {
    const results = await processImages(imagesPath, async (image) => {
        let processed = image;
        if (rotateAngle)
            processed = processed.rotate(rotateAngle);
        if (flipHorizontal)
            processed = processed.flop();
        if (flipVertical)
            processed = processed.flip();
        return processed;
    }, "rotatedFlipped");
    return {
        content: results.map(result => ({
            type: "text",
            text: result.success
                ? `Processed ${result.path} → ${result.outputPath}`
                : `Failed to process ${result.path}: ${result.error}`
        }))
    };
});
// 6. 图像后处理工具
server.tool("image.postProcess", {
    imagesPath: z.array(z.string().transform(p => p.replace(/[\\/]/g, path.sep))).min(1).describe("Array of image file paths(please use absolute path)"),
    brightness: z.number().min(-1).max(1).optional()
        .describe("Brightness adjustment (-1 to 1)"),
    contrast: z.number().min(-1).max(1).optional()
        .describe("Contrast adjustment (-1 to 1)"),
    saturation: z.number().min(-1).max(1).optional()
        .describe("Saturation adjustment (-1 to 1)"),
    blur: z.number().min(0).optional()
        .describe("Blur radius in pixels"),
    sharpen: z.number().min(0).max(100).optional()
        .describe("Sharpening intensity (0-100)")
}, async ({ imagesPath, brightness, contrast, saturation, blur, sharpen }) => {
    const results = await processImages(imagesPath, async (image) => {
        let processed = image;
        if (brightness !== undefined)
            processed = processed.modulate({ brightness: brightness + 1 });
        if (contrast !== undefined) {
            const contrastFactor = contrast + 1;
            processed = processed.linear(contrastFactor, -(0.5 * contrastFactor) + 0.5);
        }
        if (saturation !== undefined)
            processed = processed.modulate({ saturation: saturation + 1 });
        if (blur)
            processed = processed.blur(blur);
        if (sharpen)
            processed = processed.sharpen({ sigma: sharpen / 20 });
        return processed;
    }, "postProcessed");
    return {
        content: results.map(result => ({
            type: "text",
            text: result.success
                ? `Processed ${result.path} → ${result.outputPath}`
                : `Failed to process ${result.path}: ${result.error}`
        }))
    };
});
// 启动服务器
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
    console.log("Image Processor MCP Server is running");
});
