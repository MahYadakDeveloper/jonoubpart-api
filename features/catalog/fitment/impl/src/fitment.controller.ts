import { Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { FitmentService } from './fitment.service';

@Controller('catalog/fitment')
export class FitmentController {
  constructor(private readonly fitment: FitmentService) {}
  @Get(':id')
  findOne() {}
  @Post()
  createOne() {}
  @Put()
  updateOne() {}
  @Delete()
  deleteOne() {}
}
