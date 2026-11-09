import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProblemViolationDto {
  @ApiProperty() detail!: string;
  @ApiPropertyOptional() pointer?: string;
}

export class ProblemDetailsDto {
  @ApiProperty({ example: 'urn:problem:stock-not-found' }) type!: string;
  @ApiProperty() title!: string;
  @ApiProperty() status!: number;
  @ApiPropertyOptional() detail?: string;
  @ApiPropertyOptional() instance?: string;
  @ApiPropertyOptional() code?: string;
  @ApiPropertyOptional({ type: () => [ProblemViolationDto] })
  errors?: ProblemViolationDto[];
}
