ALTER TABLE `heap_nodes` ADD `project_id` text REFERENCES heap_nodes(id) ON DELETE RESTRICT;
