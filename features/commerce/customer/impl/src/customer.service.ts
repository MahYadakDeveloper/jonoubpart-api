import { Injectable } from '@nestjs/common';
import { type CustomerRepository } from './customer.repository';

@Injectable()
export class CustomersService {
  constructor(private readonly repository: CustomerRepository) {}

  // createMerchantTypeCustomer({
  //   fullName,
  //   phoneNumber,
  //   address,
  // }: {
  //   phoneNumber: string;
  //   fullName: string;
  //   address: Extract<CustomerAddress, { scope: 'intra_city' }>;
  // }): Promise<{ id: string }> {
  //   return this.repository.create({
  //     type: 'merchant',
  //     fullName,
  //     phoneNumber,
  //     addresses: [address],
  //   });
  // }

  // createTechnicianTypeCustomer({
  //   fullName,
  //   phoneNumber,
  //   specialty,
  //   address,
  // }: {
  //   phoneNumber: string;
  //   fullName: string;
  //   address: Extract<CustomerAddress, { scope: 'intra_city' }>;
  //   specialty: TechnicianSpecialty;
  // }): Promise<{ id: string }> {
  //   return this.repository.create({
  //     type: 'technician',
  //     fullName,
  //     phoneNumber,
  //     specialty,
  //     addresses: [address],
  //   });
  // }
}
