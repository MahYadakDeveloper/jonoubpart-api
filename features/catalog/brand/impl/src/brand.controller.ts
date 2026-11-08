import { Controller, Delete, Get, Post, Put } from '@nestjs/common';

@Controller('catalog/brand')
export class BrandController {
  @Get(':id')
  findOne() {}

  /**
   * [NOTE] Handles a multipart/form-data request.
   *
   * This endpoint expects uploaded files and will consume them using
   * Fastify's multipart API (e.g. `await req.file()` or `req.parts()`).
   *
   * Prerequisite:
   * The `@fastify/multipart` plugin must be registered during application
   * bootstrap. Otherwise, multipart APIs will not be available on the request
   * object and this endpoint will fail at runtime.
   *
   * Note:
   * `req` is intentionally typed as `any` because Fastify augments the request
   * object with multipart methods via plugin registration rather than static
   * typings. Refer to the Fastify Request documentation for the available APIs.
   */
  @Post()
  createOne() {}

  // [TODO] Handle media like catalog controller
  @Put()
  updateOne() {}

  // [TODO] Handle media like catalog controller
  @Delete()
  deleteOne() {}
}
