import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class BuscarCatalogoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  texto!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limite?: number;
}
