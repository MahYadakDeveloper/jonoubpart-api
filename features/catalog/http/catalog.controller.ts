import { Controller, Get } from '@nestjs/common';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogApi) {}
  @Get(':id')
  getProduct() {}

  @Get()
  listProduct() {}
}
