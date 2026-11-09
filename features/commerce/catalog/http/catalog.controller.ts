import { Controller, Get } from '@nestjs/common';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get(':id')
  getProduct() {}

  @Get()
  listProduct() {}
}
